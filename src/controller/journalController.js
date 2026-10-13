const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Follow } = require("../model/follow")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { Comment } = require("../model/comment")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { SummaryJob } = require("../model/summaryJob")
const { Subscription } = require("../model/subscription")
const { ENTRY_VISIBILITY_BY_JOURNAL } = require("../utils/constant")
const { canReadEntryWithAccess } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")

const SORTS = {
    updated: { pinned: -1, lastEntryAt: -1, updatedAt: -1 },
    alpha: { title: 1 },
    created: { createdAt: -1 },
    manual: { order: 1, createdAt: 1 }
}

const getOwnJournals = async (req, res) => {
    const { page, limit, skip } = req.pagination
    const query = { authorId: req.userObj._id }

    if (req.query.status) query.status = req.query.status

    const [journals, total] = await Promise.all([
        Journal.find(query).select("-chapters").sort(SORTS[req.journalSort]).skip(skip).limit(limit).lean(),
        Journal.countDocuments(query)
    ])

    res.status(200).json(paginatedResponse("Your journals", journals, total, page, limit))
}

const getUserJournals = async (req, res) => {
    const authorId = req.params.uid
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    if (userId.equals(authorId)) return getOwnJournals(req, res)

    const participants = [userId.toString(), authorId].sort().join("|")

    const [blocked, connection, follows] = await Promise.all([
        BlockList.exists({ participants }),
        Connection.exists({ participants, status: "accepted" }),
        Follow.find({ followerId: userId, status: "active" }).select("journalId").lean()
    ])

    if (blocked) return res.status(404).json({ message: "User does not exist" })

    const followedIds = follows.map(item => item.journalId)
    const visibilityConditions = [{ visibility: "public" }]

    if (connection) visibilityConditions.push({ visibility: "friends" })

    const subscribed = await Subscription.exists({ subscriberId: userId, authorId })

    visibilityConditions.push({ visibility: "selected", _id: { $in: followedIds } })

    if (subscribed) {
        visibilityConditions.push({ visibility: "subscribed" })
    }

    const query = { authorId, $or: visibilityConditions }

    if (req.query.status) {
        query.status = req.query.status
    }

    const [journals, total] = await Promise.all([
        Journal.find(query).select("-chapters").sort(SORTS[req.journalSort]).skip(skip).limit(limit).lean(),
        Journal.countDocuments(query)
    ])

    res.status(200).json(paginatedResponse("User journals", journals, total, page, limit))
}

const getJournal = async (req, res) => {
    const journal = req.journal.toObject()
    const access = req.journalAccess

    const entries = await Entry.find({ journalId: journal._id }).sort({ createdAt: 1 }).lean()

    const entriesByChapter = new Map()

    for (const entry of entries) {
        const key = entry.chapterId.toString()
        if (!entriesByChapter.has(key)) entriesByChapter.set(key, [])
        entriesByChapter.get(key).push(entry)
    }

    if (access.mode !== "full") {
        delete journal.progress
        delete journal.endedAt
        delete journal.lastEntryAt
        delete journal.aiSummary
    }

    journal.chapters = journal.chapters
        .sort((a, b) => a.order - b.order)
        .map(chapter => {
            const chapterEntries = entriesByChapter.get(chapter._id.toString()) || []

            if (access.mode === "preview") {
                return {
                    ...chapter,
                    entries: chapterEntries.map(entry => ({ _id: entry._id, hidden: true }))
                }
            }

            if (access.mode === "teaser") {
                const visibleTitles = chapterEntries
                    .filter(entry => entry.visibility !== "private")
                    .slice(0, 3)
                    .map(entry => ({ _id: entry._id, title: entry.title, hidden: false }))

                return {
                    ...chapter,
                    entries: visibleTitles,
                    hiddenEntryCount: Math.max(0, chapterEntries.length - visibleTitles.length)
                }
            }

            return {
                ...chapter,
                entries: chapterEntries.map(entry => canReadEntryWithAccess(entry, access) ? entry : { _id: entry._id, hidden: true })
            }
        })

    res.status(200).json({ message: "Journal retrieved successfully", data: journal })
}

const createJournal = async (req, res) => {
    const journal = await Journal.create({ ...req.validatedBody, authorId: req.userObj._id })
    res.status(201).json({ message: "Journal created successfully", data: journal })
}

const updateJournal = async (req, res) => {
    const session = await mongoose.startSession()
    let updatedJournal

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            if (!journal) {
                const error = new Error("Journal does not exist")
                error.statusCode = 404
                throw error
            }

            const { updateChapters, ...updates } = req.validatedBody

            if (updates.visibility && updates.visibility !== journal.visibility) {
                await Entry.updateMany(
                    { journalId: journal._id, visibility: { $nin: ENTRY_VISIBILITY_BY_JOURNAL[updates.visibility] } },
                    { $set: { visibility: updates.visibility } },
                    { session }
                )
            }

            Object.assign(journal, updates)

            if (updateChapters) {
                for (const update of updateChapters) {
                    const chapter = journal.chapters.id(update.cid)
                    if (!chapter) {
                        const error = new Error(`Chapter does not belong to this journal: ${update.cid}`)
                        error.statusCode = 400
                        throw error
                    }
                    chapter.title = update.title
                }
            }

            updatedJournal = await journal.save({ session })
        })
    } finally {
        await session.endSession()
    }

    res.status(200).json({ message: "Journal updated successfully", data: updatedJournal })
}

const deleteJournal = async (req, res) => {
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const entries = await Entry.find({ journalId: req.journal._id }, { _id: 1 }, { session }).lean()

            const entryIds = entries.map(entry => entry._id)

            await Promise.all([
                Like.deleteMany({ entryId: { $in: entryIds } }, { session }),
                Bookmark.deleteMany({ entryId: { $in: entryIds } }, { session }),
                Comment.deleteMany({ journalId: req.journal._id }, { session }),
                Follow.deleteMany({ journalId: req.journal._id }, { session }),
                Entry.deleteMany({ journalId: req.journal._id }, { session }),
                SummaryJob.deleteMany({ journalId: req.journal._id }, { session })
            ])

            await Journal.deleteOne({ _id: req.journal._id, authorId: req.userObj._id }, { session })
        })
    } finally {
        await session.endSession()
    }

    res.status(200).json({ message: "Journal and all associated data deleted successfully" })
}

module.exports = {
    getOwnJournals,
    getUserJournals,
    getJournal,
    createJournal,
    updateJournal,
    deleteJournal
}


