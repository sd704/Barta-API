const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Comment } = require("../model/comment")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { enqueueJournalSummary } = require("../services/journalSummaryService")

// For GET "/api/journals/:jid/chapters" -> Return Chapters in reading order
const getChapters = async (req, res) => {

    // Sorted Chapters
    const chapters = [...req.journal.chapters].sort((a, b) => a.order - b.order)
    res.status(200).json({ message: "Journal chapters retrieved successfully", data: chapters })
}

// For POST "/api/journals/:jid/chapters" -> Add new Chapter
const addChapter = async (req, res) => {
    const journal = req.journal

    // New Chapter has order = max existing order + 1
    const nextOrder = journal.chapters.length ? Math.max(...journal.chapters.map(chapter => chapter.order)) + 1 : 1

    // title already validated by middleware
    journal.chapters.push({ title: req.validatedBody.title, order: nextOrder })
    await journal.save()

    // data is the new Chapter
    res.status(201).json({ message: "Chapter added successfully", data: journal.chapters[journal.chapters.length - 1] })
}

// For PATCH "/api/journals/:jid/chapters/:cid" -> Update Title
const updateChapter = async (req, res) => {

    // DocumentArray.id(cid) searches array by id
    const chapter = req.journal.chapters.id(req.params.cid)

    if (!chapter) return res.status(404).json({ message: "Chapter does not exist" })

    chapter.title = req.validatedBody.title
    await req.journal.save()
    res.status(200).json({ message: "Chapter updated successfully", data: chapter })
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

            if (!chapter) {
                const error = new Error("Chapter does not exist")
                error.statusCode = 404
                throw error // throw will abort this transaction
            }

            const entries = await Entry.find({ journalId, chapterId }).select("_id").session(session).lean()
            const entryIds = entries.map(entry => entry._id)

            // Cleanup before Chapter deletion
            await Promise.all([
                Like.deleteMany({ entryId: { $in: entryIds } }).session(session), // Delete Likes where entryId in entryIds
                Bookmark.deleteMany({ entryId: { $in: entryIds } }).session(session), // Delete Bookmark where entryId in entryIds
                Comment.deleteMany({ entryId: { $in: entryIds } }).session(session), // Delete Comment where entryId in entryIds
                Entry.deleteMany({ journalId, chapterId }).session(session) // Delete Entries where jid and cid match
            ])

            chapter.deleteOne() // Delete Chapter

            // Delete gaps by sorting then assign index+1 as order
            journal.chapters.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1 })

            // entryCount, milestoneCount, latestEntry are Journal data which need to be updated everytime entries change
            const [entryCount, milestoneCount, latestEntry] = await Promise.all([
                Entry.countDocuments({ journalId }).session(session), // Count remaining Entries
                Entry.countDocuments({ journalId, type: "milestone" }).session(session), // Count remaining Entries which are milestones
                Entry.findOne({ journalId }).sort({ createdAt: -1 }).select("createdAt").session(session).lean() // Updated "latestEntry" = createdAt (latest date)
            ])

            journal.entryCount = entryCount
            journal.milestoneCount = milestoneCount
            journal.lastEntryAt = latestEntry?.createdAt || null
            await journal.save({ session }) // session keeps it in the transaction
            await enqueueJournalSummary(journal._id, session) // Summarize after everything is done
        })
    } finally {
        await session.endSession()
    }
    res.status(200).json({ message: "Chapter and all associated entries deleted successfully" })
}

// For "/api/journals/:jid/chapters/reorder"
const reorderChapters = async (req, res) => {
    const journal = req.journal
    const requestedIds = req.validatedBody.chaptersInOrder
    const existingIds = journal.chapters.map(chapter => chapter._id.toString())

    // some() -> Array method that checks at least one element satisfies the condition
    if (requestedIds.length !== existingIds.length || existingIds.some(id => !requestedIds.includes(id))) {
        return res.status(400).json({ message: "chaptersInOrder must contain every chapter ID exactly once" })
    }

    // Array of key value pair -> cid, chapterDoc
    const chapterMap = new Map(journal.chapters.map(chapter => [chapter._id.toString(), chapter]))

    journal.chapters = requestedIds.map((id, index) => {
        const chapter = chapterMap.get(id)
        chapter.order = index + 1 // Use index as order
        return chapter
    })

    await journal.save()
    res.status(200).json({ message: "Chapters reordered successfully", data: journal.chapters })
}

module.exports = {
    getChapters,
    addChapter,
    updateChapter,
    deleteChapter,
    reorderChapters
}
