const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { Comment } = require("../model/comment")
const { refreshJournalSummary } = require("../services/journalSummaryService")
const { entryVisibilityForJournal, commentsAllowedForVisibility } = require("../policy/journalRules")
const { readableEntryVisibilities } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { httpError } = require("../utils/httpError")
const { refreshEntryStats } = require("../services/journalStats")

// The chapter id, if the chapter belongs to this journal
const findChapterId = (journal, chapterId) => {
    const chapter = journal.chapters.id(chapterId)
    if (!chapter) throw httpError(400, "Selected chapter does not belong to this journal")
    return chapter._id
}

// Adds a chapter at the end and returns its id. The journal is saved by the caller.
const addChapter = (journal, title) => {
    const nextOrder = journal.chapters.length ? Math.max(...journal.chapters.map(item => item.order)) + 1 : 1
    journal.chapters.push({ title, order: nextOrder })
    return journal.chapters[journal.chapters.length - 1]._id
}

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

// For GET "/api/entries/:eid"
// No DB call as loadEntryJournal already fetched this entry
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
            if (!journal) throw httpError(404, "Journal does not exist")

            const { chapterId, newChapter, progress, ...entryData } = req.validatedBody
            entryData.visibility = entryVisibilityForJournal(journal.visibility, entryData.visibility)
            const commentsAllowed = commentsAllowedForVisibility(entryData.visibility, entryData.commentsAllowed)

            if (commentsAllowed === undefined) {
                delete entryData.commentsAllowed // Public and other non-private entries keep the schema default when omitted.
            } else {
                entryData.commentsAllowed = commentsAllowed // Private stores false. A true value on private was already rejected.
            }

            // chapterId intentionally takes priority over newChapter.
            const selectedChapterId = chapterId ? findChapterId(journal, chapterId) : addChapter(journal, newChapter)

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

    await refreshJournalSummary(req.journal._id) // After commit. A summary failure keeps the old summary and cannot fail this entry create.
    res.status(201).json({ message: "Entry created successfully", data: createdEntry })
}

// For PATCH "/api/entries/:eid", Journal Author only
const updateEntry = async (req, res) => {
    const session = await mongoose.startSession()
    let updatedEntry

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            const entry = await Entry.findOne({ _id: req.entry._id, authorId: req.userObj._id }).session(session)
            if (!journal || !entry) throw httpError(404, "Entry does not exist")

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
                entry.chapterId = findChapterId(journal, chapterId)
            } else if (newChapter) {
                entry.chapterId = addChapter(journal, newChapter)
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

    await refreshJournalSummary(req.journal._id) // After commit. A summary failure keeps the old summary and cannot fail this entry update.
    res.status(200).json({ message: "Entry updated successfully", data: updatedEntry })
}

// For DELETE "/api/entries/:eid", Journal Author only
const deleteEntry = async (req, res) => {
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            const entry = await Entry.findOne({ _id: req.entry._id, authorId: req.userObj._id }).session(session)
            if (!journal || !entry) throw httpError(404, "Entry does not exist")

            // One operation at a time. A transaction does not support parallel operations on its session.
            await Like.deleteMany({ entryId: entry._id }, { session })
            await Bookmark.deleteMany({ entryId: entry._id }, { session })
            await Comment.deleteMany({ entryId: entry._id }, { session })
            await Entry.deleteOne({ _id: entry._id }, { session })

            await refreshEntryStats(journal, session)
            await journal.save({ session })
        })
    } finally {
        await session.endSession()
    }

    await refreshJournalSummary(req.journal._id) // After commit. A summary failure keeps the old summary and cannot fail this entry delete.
    res.status(200).json({ message: "Entry and all associated interactions deleted successfully" })
}

module.exports = {
    getEntries,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry
}


