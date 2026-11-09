const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { groqSummary } = require("./groqSummary")
const { USER_NAME_FIELDS, ENTRY_FIELDS } = require("../utils/constant")

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
        journal: {
            title: journal.title,
            authorName: author?.fullName,
            about: journal.about,
            category: journal.category,
            progress: journal.progress
        },
        chapters: [...journal.chapters]
            .sort((a, b) => a.order - b.order)
            .map(chapter => ({
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

// Call after the journal, entry or chapter change is committed. Waits for the summary API, then saves aiSummary.
// Never throws. If anything fails the old aiSummary stays, because the summary is optional.
// Returns the new summary, or null when there is nothing new to return.
const refreshJournalSummary = async journalId => {
    try {
        const payload = await buildSummaryPayload(journalId)
        if (!payload) return null

        const summary = await groqSummary(payload) // API call, retries inside

        // timestamps:false so saving the summary does not move the journal's updatedAt
        const updated = await Journal.updateOne({ _id: journalId }, { $set: { aiSummary: summary } }, { timestamps: false })
        return updated.matchedCount ? summary : null
    } catch (error) {
        console.error(`Journal summary not updated for ${journalId}, keeping the old summary:`, error.message)
        return null
    }
}

module.exports = { refreshJournalSummary }

