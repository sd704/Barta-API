const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { User } = require("../model/user")
const { SummaryJob } = require("../model/summaryJob")
const { MAX_ATTEMPTS, LOCK_TIMEOUT_MS, REQUEST_TIMEOUT_MS, SUMMARY_TEXT_MAX, USER_NAME_FIELDS, ENTRY_FIELDS } = require("../utils/constant")

const SUMMARY_API_URL = process.env.SUMMARY_API_URL

let workerTimer = null
let workerRunning = false

const enqueueJournalSummary = async (journalId, session) => {
    await SummaryJob.findOneAndUpdate(
        { journalId },
        {
            $set: { status: "pending", runAt: new Date(), lockedAt: null, lastError: "" },
            $inc: { revision: 1 },
            $setOnInsert: { attempts: 0 }
        },
        {
            upsert: true,
            session,
            runValidators: true
        }
    )
}

const recoverExpiredJobs = async () => {
    const expiredBefore = new Date(Date.now() - LOCK_TIMEOUT_MS)

    await SummaryJob.updateMany(
        {
            status: "processing",
            lockedAt: { $lt: expiredBefore }
        },
        {
            $set: { status: "pending", runAt: new Date(), lockedAt: null }
        }
    )
}

const claimJob = () => SummaryJob.findOneAndUpdate(
    {
        status: "pending",
        runAt: { $lte: new Date() }
    },
    {
        $set: { status: "processing", lockedAt: new Date() }
    },
    {
        new: true,
        sort: { runAt: 1 }
    }
)

const buildSummaryPayload = async journalId => {
    const journal = await Journal.findById(journalId).lean()
    if (!journal) return null

    const [author, entries] = await Promise.all([
        User.findById(journal.authorId).select(USER_NAME_FIELDS).lean(),
        Entry.find({ journalId }).sort({ createdAt: 1 }).select(ENTRY_FIELDS).lean()
    ])

    return {
        journalUpdatedAt: journal.updatedAt,
        payload: {
            journalTitle: journal.title,
            authorName: author?.fullName || [author?.firstName, author?.lastName].filter(Boolean).join(" "),
            journalAbout: journal.about,
            category: journal.category,
            progress: journal.progress,
            entries: entries.map(entry => ({
                type: entry.type,
                title: entry.title,
                preview: entry.preview,
                body: entry.body,
                mood: entry.mood,
                tags: entry.tags,
                createdAt: entry.createdAt
            }))
        }
    }
}

const requestSummary = async payload => {
    if (!process.env.SUMMARY_API_KEY) throw new Error("SUMMARY_API_KEY is not configured")

    const response = await fetch(SUMMARY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUMMARY_API_KEY}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) throw new Error(`Summary API returned HTTP ${response.status}`)

    const data = await response.json()
    if (typeof data.summary !== "string" || !data.summary.trim()) throw new Error("Summary API returned an invalid summary")

    return data.summary.trim().slice(0, SUMMARY_TEXT_MAX)
}

const retryJob = async (job, error) => {
    const attempts = job.attempts + 1
    const failed = attempts >= MAX_ATTEMPTS
    const delayMinutes = Math.min(2 ** attempts, 60)

    await SummaryJob.updateOne(
        {
            _id: job._id,
            revision: job.revision
        },
        {
            $set: {
                status: failed ? "failed" : "pending",
                attempts,
                runAt: new Date(Date.now() + delayMinutes * 60 * 1000),
                lockedAt: null,
                lastError: error.message.slice(0, 1000)
            }
        }
    )
}

const processJob = async job => {
    try {
        const summaryData = await buildSummaryPayload(job.journalId)

        if (!summaryData) {
            await SummaryJob.deleteOne({ _id: job._id, revision: job.revision })
            return
        }

        const summary = await requestSummary(summaryData.payload)

        // Avoid saving a stale summary if another entry operation occurred.
        const updated = await Journal.updateOne(
            {
                _id: job.journalId,
                updatedAt: summaryData.journalUpdatedAt
            },
            {
                $set: { aiSummary: summary }
            }
        )

        if (!updated.modifiedCount) {
            await SummaryJob.updateOne(
                { _id: job._id, revision: job.revision },
                { $set: { status: "pending", runAt: new Date(), lockedAt: null } }
            )
            return
        }

        await SummaryJob.deleteOne({ _id: job._id, revision: job.revision })
    } catch (error) {
        await retryJob(job, error)
    }
}

const runWorker = async () => {
    if (workerRunning) return
    workerRunning = true

    try {
        await recoverExpiredJobs()
        const job = await claimJob()
        if (job) await processJob(job)
    } catch (error) {
        console.error("Journal summary worker error:", error)
    } finally {
        workerRunning = false
    }
}

const startSummaryWorker = () => {
    if (workerTimer) return

    runWorker()
    workerTimer = setInterval(runWorker, 5000)
    workerTimer.unref()
}

module.exports = {
    enqueueJournalSummary,
    startSummaryWorker
}

