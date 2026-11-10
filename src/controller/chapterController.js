const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Comment } = require("../model/comment")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { refreshJournalSummary } = require("../services/journalSummaryService")
const { refreshEntryStats } = require("../services/journalStats")
const { httpError } = require("../utils/httpError")

// Adding, renaming and reordering chapters is done by PATCH "/api/journals/:jid" (updateJournal "chapters")

// For GET "/api/journals/:jid/chapters" -> Return Chapters in reading order
const getChapters = async (req, res) => {

    // Sorted Chapters
    const chapters = [...req.journal.chapters].sort((a, b) => a.order - b.order)
    res.status(200).json({ message: "Journal chapters retrieved successfully", data: chapters })
}

// For DELETE "/api/journals/:jid/chapters/:cid"
const deleteChapter = async (req, res) => {
    const journalId = req.journal._id
    const chapterId = req.params.cid

    // Opens client session. A session is required to group several writes into a single transaction.
    // session helps with roll back if transaction aborts
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {

            // .session(session) -> read inside the transaction
            const journal = await Journal.findOne({ _id: journalId, authorId: req.userObj._id }).session(session)
            const chapter = journal?.chapters.id(chapterId)
            if (!chapter) throw httpError(404, "Chapter does not exist") // throw will abort this transaction

            const entries = await Entry.find({ journalId, chapterId }).select("_id").session(session).lean()
            const entryIds = entries.map(entry => entry._id)

            // Cleanup before Chapter deletion, one operation at a time. A transaction does not support parallel operations on its session.
            await Like.deleteMany({ entryId: { $in: entryIds } }).session(session) // Delete Likes where entryId in entryIds
            await Bookmark.deleteMany({ entryId: { $in: entryIds } }).session(session) // Delete Bookmark where entryId in entryIds
            await Comment.deleteMany({ entryId: { $in: entryIds } }).session(session) // Delete Comment where entryId in entryIds
            await Entry.deleteMany({ journalId, chapterId }).session(session) // Delete Entries where jid and cid match

            chapter.deleteOne() // Delete Chapter

            // Delete gaps by sorting then assign index+1 as order
            journal.chapters.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1 })

            // entryCount, milestoneCount, latestEntry are Journal data which need to be updated everytime entries change
            await refreshEntryStats(journal, session)
            await journal.save({ session }) // session keeps it in the transaction
        })
    } finally {
        await session.endSession()
    }

    await refreshJournalSummary(journalId) // After commit. A summary failure keeps the old summary and does not fail this delete.
    res.status(200).json({ message: "Chapter and all associated entries deleted successfully" })
}

module.exports = {
    getChapters,
    deleteChapter
}
