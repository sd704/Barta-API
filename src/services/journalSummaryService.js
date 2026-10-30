const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { SummaryJob } = require("../model/summaryJob")
const { groqSummary } = require("./groqSummary")
const { MAX_ATTEMPTS, LOCK_TIMEOUT_MS, USER_NAME_FIELDS, ENTRY_FIELDS } = require("../utils/constant")

let workerTimer = null // The interval handle. startSummaryWorker won't start a second loop.
let workerRunning = false // Stops a slow run from overlapping the next 5-second tick.

// DB operation for enqueueJournalSummaryInBackground
const enqueueJournalSummary = async journalId => {
    await SummaryJob.findOneAndUpdate(
        { journalId }, // Filter based on jid
        {
            // $set — reset the job so the worker will pick it up on its next tick.
            $set: { status: "pending", attempts: 0, runAt: new Date(), lockedAt: null, lastError: "" },

            // $inc version — every write gets a new version. When an insert happens, $inc starts from 0 so version becomes 1.
            $inc: { version: 1 },
        },
        {
            upsert: true, // Insert a new job when none exists for this journal, otherwise update the existing one.
            runValidators: true // Validate the update against the schema (status enum, revision min). Updates skip validators by default.
        }
    )
}

// Called inside the entry and chapter-delete transactions, create a job after transaction
const enqueueJournalSummaryInBackground = journalId => {
    let attempts = 0

    const tryEnqueue = async () => {
        attempts += 1
        try {
            await enqueueJournalSummary(journalId)
        } catch (error) {
            if (attempts >= MAX_ATTEMPTS) {
                console.error(`Unable to queue journal summary for ${journalId} after ${attempts} attempts:`, error)
                return
            }

            const retryTimer = setTimeout(tryEnqueue, attempts * 1000)
            retryTimer.unref() // The optional retry does not keep an otherwise idle API process alive.
        }
    }

    tryEnqueue() // It will run and update the summary. We don't need to wait for it so no 'await'
}

// A worker that crashed while status was "processing" would otherwise leave the job locked forever.
// Jobs locked longer than LOCK_TIMEOUT_MS go back to pending.
const recoverExpiredJobs = async () => {
    const expiredBefore = new Date(Date.now() - LOCK_TIMEOUT_MS) // Locks taken before this time are considered abandoned.

    // updateMany to fix all jobs with given filters
    await SummaryJob.updateMany(

        // Filter jobs with status = processing, lockedAt is less than ($lt) expiredBefore
        { status: "processing", lockedAt: { $lt: expiredBefore } },

        // $set — reset the job
        { $set: { status: "pending", runAt: new Date(), lockedAt: null } }
    ) // No session: the worker runs outside request transactions. Each matched document is updated atomically on its own.
}

// Atomically take the oldest due pending job.
const claimJob = () => SummaryJob.findOneAndUpdate(

    // Filter jobs with status = processing, runAt is "less than or equal" ($lte) Date
    { status: "pending", runAt: { $lte: new Date() } },

    // Mark it claimed and record when, for recoverExpiredJobs.
    { $set: { status: "processing", lockedAt: new Date() } },

    {
        returnDocument: "after", // Return the document after the update. The caller needs its version and attempts.
        sort: { runAt: 1 } // When several jobs are due, claim the one that has waited longest. Uses the { status, runAt } index.
    }
)

// POST body for the summary model. 
// Chapters follow chapter.order. Entries inside a chapter follow createdAt, oldest first.
const buildSummaryPayload = async journalId => {
    const [journal, entries] = await Promise.all([
        Journal.findById(journalId).populate({ path: "author", select: USER_NAME_FIELDS }).lean(),
        Entry.find({ journalId }).sort({ createdAt: 1 }).select(ENTRY_FIELDS).lean()
    ])
    if (!journal) return null

    const entriesByChapter = new Map()
    for (const entry of entries) {
        const key = entry.chapterId.toString()
        const chapterEntries = entriesByChapter.get(key)
        if (chapterEntries) {
            chapterEntries.push(entry)
        } else {
            entriesByChapter.set(key, [entry])
        }
    }

    // populate("author") adds this virtual at runtime. The inferred journal type only contains stored fields, so authorId is the only author-related property it knows.
    const author = journal.author

    return {
        journalUpdatedAt: journal.updatedAt, // Compared again before saving, so a newer edit is not overwritten by this snapshot.
        payload: {
            journal: {
                title: journal.title,
                authorName: author?.fullName || [author?.firstName, author?.lastName].filter(Boolean).join(" "),
                about: journal.about,
                category: journal.category,
                progress: journal.progress
            },
            chapters: [...journal.chapters]
                .sort((a, b) => a.order - b.order)
                .map(chapter => ({
                    order: chapter.order,
                    title: chapter.title,
                    entries: (entriesByChapter.get(chapter._id.toString()) || []).map(entry => ({
                        title: entry.title,
                        preview: entry.preview,
                        body: entry.body,
                        type: entry.type,
                        mood: entry.mood,
                        tags: entry.tags,
                        createdAt: entry.createdAt
                    }))
                }))
        }
    }
}

// Record a failure. The update matches version so a newer enqueue is not marked failed by this old attempt.
const retryJob = async (job, error) => {
    const attempts = job.attempts + 1
    const failed = (attempts >= MAX_ATTEMPTS)
    const delayMinutes = Math.min(2 ** attempts, 60) // max 1hr <- 60 mins

    await SummaryJob.updateOne(
        {
            _id: job._id,
            version: job.version // If this attempt is old, lets say "4", new is "5", then this query will not match so nothing changes
        },
        {
            $set: {
                status: failed ? "failed" : "pending", // failed jobs are never claimed again.
                attempts,
                runAt: new Date(Date.now() + delayMinutes * 60 * 1000), // claimJob ignores the job until then.
                lockedAt: null, // Release the claim.
                lastError: error.message.slice(0, 1000) // Keep the stored error short.
            }
        }
    )
}

// For one claimed job: build the payload, call the provider, and save only if the journal has not changed since the snapshot.
const processJob = async job => {
    try {
        const summaryData = await buildSummaryPayload(job.journalId)

        if (!summaryData) {
            await SummaryJob.deleteOne({ _id: job._id, version: job.version }) // Delete job if no data
            return
        }

        const summary = await groqSummary(summaryData.payload) // API call

        if (typeof summary !== "string" || !summary.trim()) throw new Error("Summary API returned an invalid summary")

        // Avoid saving a stale summary if another entry operation occurred.
        const updated = await Journal.updateOne(
            {
                _id: job.journalId,
                updatedAt: summaryData.journalUpdatedAt // updatedAt must equal the time we read. 
                // If any later save changed the journal, updatedAt moved and nothing matches.
            },
            { $set: { aiSummary: summary } }
        )

        // the journal changed, so run again against the new text.
        if (!updated.modifiedCount) {
            await SummaryJob.updateOne(
                { _id: job._id, version: job.version },
                { $set: { status: "pending", runAt: new Date(), lockedAt: null } }
            )
            return
        }

        await SummaryJob.deleteOne({ _id: job._id, version: job.version }) // success
    } catch (error) {
        // We retry if any failure occurs
        // They do not fail the original entry request.
        await retryJob(job, error)
    }
}

const runWorker = async () => {
    if (workerRunning) return // Don't start if a job is already running
    workerRunning = true

    try {
        await recoverExpiredJobs() // recover expired "processing" jobs by marking them as "pending"
        const job = await claimJob() // Get oldest "pending" job
        if (job) await processJob(job) // If job exists, run job, on success delete it, else retry
    } catch (error) {
        console.error("Journal summary worker error:", error)
    } finally {
        workerRunning = false // Reset tick
    }
}

const startSummaryWorker = () => {
    if (workerTimer) return // Return if interval already exists

    runWorker() // Don't wait for first job
    workerTimer = setInterval(runWorker, 5000) // runWorker every 5 sec
    workerTimer.unref() // Lets node.js exit if nothing is keeping it alive
}

module.exports = {
    enqueueJournalSummary,
    enqueueJournalSummaryInBackground,
    startSummaryWorker
}

