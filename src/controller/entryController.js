const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { Comment } = require("../model/comment")
const { enqueueJournalSummaryInBackground } = require("../services/journalSummaryService")
const { entryVisibilityForJournal, commentsAllowedForVisibility } = require("../policy/journalRules")
const { readableEntryVisibilities } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")

// For GET "/api/journals/:jid/entries"
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

// For GET "/api/journals/:jid/entries/:eid"
// No DB call as loadEntry already fetched this entry
const getEntry = async (req, res) => {
    res.status(200).json({ message: "Entry retrieved successfully", data: req.entry })
}

// For POST "/api/journals/:jid/entries", Journal Author only
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
            const commentsAllowed = commentsAllowedForVisibility(entryData.visibility, entryData.commentsAllowed)

            if (commentsAllowed === undefined) {
                delete entryData.commentsAllowed // Public and other non-private entries keep the schema default when omitted.
            } else {
                entryData.commentsAllowed = commentsAllowed // Private stores false. A true value on private was already rejected.
            }

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
                // For new chapter
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

            await journal.save({ session }) // milestoneCount, progress, lastEntryAt need to be updated in Journal
        })
    } finally {
        await session.endSession()
    }

    enqueueJournalSummaryInBackground(req.journal._id) // Optional. Its failures retry separately and cannot fail this entry create.
    res.status(201).json({ message: "Entry created successfully", data: createdEntry })
}

// For PATCH "/api/journals/:jid/entries/:eid", Journal Author only
const updateEntry = async (req, res) => {
    const session = await mongoose.startSession()
    let updatedEntry

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            const entry = await Entry.findOne({ _id: req.params.eid, journalId: req.journal._id, authorId: req.userObj._id }).session(session)

            if (!journal || !entry) {
                const error = new Error("Entry does not exist")
                error.statusCode = 404
                throw error
            }

            const { chapterId, newChapter, ...updates } = req.validatedBody
            if (updates.visibility !== undefined) {
                updates.visibility = entryVisibilityForJournal(journal.visibility, updates.visibility)
            }

            const nextVisibility = updates.visibility === undefined ? entry.visibility : updates.visibility
            const commentsAllowed = commentsAllowedForVisibility(nextVisibility, updates.commentsAllowed)
            if (commentsAllowed === undefined) {
                delete updates.commentsAllowed
            } else {
                updates.commentsAllowed = commentsAllowed // Changing an entry to private turns comments off.
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

            const wasMilestone = (entry.type === "milestone")

            Object.assign(entry, updates)
            await entry.save({ session })

            const isMilestone = (entry.type === "milestone")
            if (!wasMilestone && isMilestone) {
                journal.milestoneCount += 1
            } else if (wasMilestone && !isMilestone) {
                journal.milestoneCount = Math.max(0, journal.milestoneCount - 1)
            }

            journal.lastEntryAt = new Date()
            await journal.save({ session })
            updatedEntry = entry
        })
    } finally {
        await session.endSession()
    }

    enqueueJournalSummaryInBackground(req.journal._id) // Optional. Its failures retry separately and cannot fail this entry update.
    res.status(200).json({ message: "Entry updated successfully", data: updatedEntry })
}

// For DELETE "/api/journals/:jid/entries/:eid", Journal Author only
const deleteEntry = async (req, res) => {
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            const entry = await Entry.findOne({ _id: req.params.eid, journalId: req.journal._id, authorId: req.userObj._id }).session(session)

            if (!journal || !entry) {
                const error = new Error("Entry does not exist")
                error.statusCode = 404
                throw error
            }

            // One operation at a time. A transaction does not support parallel operations on its session.
            await Like.deleteMany({ entryId: entry._id }, { session })
            await Bookmark.deleteMany({ entryId: entry._id }, { session })
            await Comment.deleteMany({ entryId: entry._id }, { session })
            await Entry.deleteOne({ _id: entry._id }, { session })

            const entryCount = await Entry.countDocuments({ journalId: journal._id }).session(session)
            const milestoneCount = await Entry.countDocuments({ journalId: journal._id, type: "milestone" }).session(session)
            const latestEntry = await Entry.findOne({ journalId: journal._id }).sort({ updatedAt: -1 }).select("updatedAt").session(session).lean()

            journal.entryCount = entryCount
            journal.milestoneCount = milestoneCount
            journal.lastEntryAt = latestEntry?.updatedAt || null

            await journal.save({ session })
        })
    } finally {
        await session.endSession()
    }

    enqueueJournalSummaryInBackground(req.journal._id) // Optional. Its failures retry separately and cannot fail this entry delete.
    res.status(200).json({ message: "Entry and all associated interactions deleted successfully" })
}

module.exports = {
    getEntries,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry
}


