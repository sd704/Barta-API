const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { Comment } = require("../model/comment")
const { enqueueJournalSummary } = require("../services/journalSummaryService")
const { entryVisibilityForJournal } = require("../policy/journalRules")
const { readableEntryVisibilities } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")

const getEntries = async (req, res) => {
    const { page, limit, skip } = req.pagination
    const query = { journalId: req.journal._id }
    const visibility = readableEntryVisibilities(req.journalAccess)

    if (visibility) {
        query.visibility = { $in: visibility }
    }

    const [entries, total] = await Promise.all([
        Entry.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Entry.countDocuments(query)
    ])

    res.status(200).json(paginatedResponse(
        "Journal entries retrieved successfully",
        entries,
        total,
        page,
        limit
    ))
}

const getEntry = async (req, res) => {
    res.status(200).json({ message: "Entry retrieved successfully", data: req.entry })
}

const createEntry = async (req, res) => {
    const session = await mongoose.startSession()
    let createdEntry

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)

            if (!journal) {
                const error = new Error("Journal does not exist")
                error.statusCode = 404
                throw error
            }

            const { chapterId, newChapter, progress, ...entryData } = req.validatedBody
            entryData.visibility = entryVisibilityForJournal(journal.visibility, entryData.visibility)

            let selectedChapterId

            // chapterId intentionally takes priority over newChapter.
            if (chapterId) {
                const chapter = journal.chapters.id(chapterId)

                if (!chapter) {
                    const error = new Error("Selected chapter does not belong to this journal")
                    error.statusCode = 400
                    throw error
                }

                selectedChapterId = chapter._id
            } else {
                const nextOrder = journal.chapters.length ? Math.max(...journal.chapters.map(item => item.order)) + 1 : 1
                journal.chapters.push({ title: newChapter, order: nextOrder })
                selectedChapterId = journal.chapters[journal.chapters.length - 1]._id
            }

            const result = await Entry.create([{
                ...entryData,
                journalId: journal._id,
                authorId: req.userObj._id,
                chapterId: selectedChapterId
            }], { session })

            createdEntry = result[0]

            journal.entryCount += 1
            if (createdEntry.type === "milestone") {
                journal.milestoneCount += 1
            }

            journal.lastEntryAt = new Date()

            if (progress !== undefined) {
                journal.progress = progress
                journal.endedAt = progress === 100 ? new Date() : null
            }

            await journal.save({ session })
            await enqueueJournalSummary(journal._id, session)
        })
    } finally {
        await session.endSession()
    }

    res.status(201).json({ message: "Entry created successfully", data: createdEntry, summaryStatus: "pending" })
}

const updateEntry = async (req, res) => {
    const session = await mongoose.startSession()
    let updatedEntry

    try {
        await session.withTransaction(async () => {
            const [journal, entry] = await Promise.all([
                Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session),
                Entry.findOne({ _id: req.params.eid, journalId: req.journal._id, authorId: req.userObj._id }).session(session)
            ])

            if (!journal || !entry) {
                const error = new Error("Entry does not exist")
                error.statusCode = 404
                throw error
            }

            const { chapterId, newChapter, ...updates } = req.validatedBody
            if (updates.visibility !== undefined) {
                updates.visibility = entryVisibilityForJournal(journal.visibility, updates.visibility)
            }

            if (chapterId) {
                const chapter = journal.chapters.id(chapterId)

                if (!chapter) {
                    const error = new Error("Selected chapter does not belong to this journal")
                    error.statusCode = 400
                    throw error
                }

                entry.chapterId = chapter._id
            } else if (newChapter) {
                const nextOrder = journal.chapters.length ? Math.max(...journal.chapters.map(item => item.order)) + 1 : 1
                journal.chapters.push({ title: newChapter, order: nextOrder })
                entry.chapterId = journal.chapters[journal.chapters.length - 1]._id
            }

            const wasMilestone = entry.type === "milestone"

            Object.assign(entry, updates)
            await entry.save({ session })

            const isMilestone = entry.type === "milestone"
            if (!wasMilestone && isMilestone) journal.milestoneCount += 1
            if (wasMilestone && !isMilestone) {
                journal.milestoneCount = Math.max(0, journal.milestoneCount - 1)
            }

            journal.lastEntryAt = new Date()
            await journal.save({ session })
            await enqueueJournalSummary(journal._id, session)
            updatedEntry = entry
        })
    } finally {
        await session.endSession()
    }

    res.status(200).json({ message: "Entry updated successfully", data: updatedEntry, summaryStatus: "pending" })
}

const deleteEntry = async (req, res) => {
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const [journal, entry] = await Promise.all([
                Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session),
                Entry.findOne({ _id: req.params.eid, journalId: req.journal._id, authorId: req.userObj._id }).session(session)
            ])

            if (!journal || !entry) {
                const error = new Error("Entry does not exist")
                error.statusCode = 404
                throw error
            }

            await Promise.all([
                Like.deleteMany({ entryId: entry._id }, { session }),
                Bookmark.deleteMany({ entryId: entry._id }, { session }),
                Comment.deleteMany({ entryId: entry._id }, { session }),
                Entry.deleteOne({ _id: entry._id }, { session })
            ])

            const [entryCount, milestoneCount, latestEntry] = await Promise.all([
                Entry.countDocuments({ journalId: journal._id }).session(session),
                Entry.countDocuments({ journalId: journal._id, type: "milestone" }).session(session),
                Entry.findOne({ journalId: journal._id }).sort({ updatedAt: -1 }).select("updatedAt").session(session).lean()
            ])

            journal.entryCount = entryCount
            journal.milestoneCount = milestoneCount
            journal.lastEntryAt = latestEntry?.updatedAt || null

            await journal.save({ session })
            await enqueueJournalSummary(journal._id, session)
        })
    } finally {
        await session.endSession()
    }

    res.status(200).json({ message: "Entry and all associated interactions deleted successfully", summaryStatus: "pending" })
}

module.exports = {
    getEntries,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry
}


