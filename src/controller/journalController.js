const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Follow } = require("../model/follow")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { Comment } = require("../model/comment")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { Subscription } = require("../model/subscription")
const { ENTRY_VISIBILITY_BY_JOURNAL } = require("../utils/constant")
const { commentsAllowedForVisibility } = require("../policy/journalRules")
const { canReadEntryWithAccess } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { refreshJournalSummary } = require("../services/journalSummaryService")

// For sorting using query
const SORTS = {
    updated: { pinned: -1, lastEntryAt: -1, updatedAt: -1 },
    alpha: { title: 1 },
    created: { createdAt: -1 },
    manual: { order: 1, createdAt: 1 }
}

// For GET "/api/journals" <- LoggedIn User's Journals
const getOwnJournals = async (req, res) => {
    const { page, limit, skip } = req.pagination
    const query = { authorId: req.userObj._id }

    if (req.query.status) {
        query.status = req.query.status
    }

    const [journals, total] = await Promise.all([
        Journal.find(query).select("-chapters").sort(SORTS[req.journalSort]).skip(skip).limit(limit).lean(), // Exclude Chapters
        Journal.countDocuments(query)
    ])

    res.status(200).json(paginatedResponse("Your journals", journals, total, page, limit))
}

// For GET "/api/users/:uid/journals",
const getUserJournals = async (req, res) => {
    const authorId = req.params.uid
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    if (userId.equals(authorId)) return getOwnJournals(req, res)

    const participants = [userId.toString(), authorId].sort().join("|")

    // Check Connection with user
    const [blocked, connection, follows] = await Promise.all([
        BlockList.exists({ participants }),
        Connection.exists({ participants, status: "accepted" }),
        Follow.find({ followerId: userId, status: "active" }).select("journalId").lean()
    ])

    if (blocked) return res.status(404).json({ message: "User does not exist" })

    const followedIds = follows.map(item => item.journalId)
    const visibilityConditions = [{ visibility: "public" }]

    if (connection) {
        visibilityConditions.push({ visibility: "friends" })
    }

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
        Journal.find(query).select("-chapters").sort(SORTS[req.journalSort]).skip(skip).limit(limit).lean(), // Exclude Chapters
        Journal.countDocuments(query)
    ])

    res.status(200).json(paginatedResponse("User journals", journals, total, page, limit))
}

// For GET "/api/journals/:jid"
const getJournal = async (req, res) => {
    const journal = req.journal.toObject()
    const access = req.journalAccess // Full, Preview or Teaser

    const entries = await Entry.find({ journalId: journal._id }).sort({ createdAt: 1 }).lean()

    const entriesByChapter = new Map()

    for (const entry of entries) {
        const key = entry.chapterId.toString()
        if (!entriesByChapter.has(key)) {
            entriesByChapter.set(key, [])
        }
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

            const chapterEntries = entriesByChapter.get(chapter._id.toString()) || [] // Specific Chapter Entries

            if (access.mode === "preview") {
                return { ...chapter, entries: chapterEntries.map(entry => ({ _id: entry._id, hidden: true })) }
            }

            if (access.mode === "teaser") {
                const visibleTitles = chapterEntries
                    .filter(entry => entry.visibility !== "private")
                    .slice(0, 3) // Only first 3 entries visible
                    .map(entry => ({ _id: entry._id, title: entry.title, hidden: false }))

                return {
                    ...chapter,
                    entries: visibleTitles,
                    hiddenEntryCount: Math.max(0, chapterEntries.length - visibleTitles.length)
                }
            }

            // For Full access
            return {
                ...chapter,
                entries: chapterEntries.map(entry => canReadEntryWithAccess(entry, access) ? entry : { _id: entry._id, hidden: true })
            }
        })

    res.status(200).json({ message: "Journal retrieved successfully", data: journal })
}

// For POST "/api/journals"
const createJournal = async (req, res) => {
    const journal = await Journal.create({ ...req.validatedBody, authorId: req.userObj._id })
    res.status(201).json({ message: "Journal created successfully", data: journal })
}

// Rebuilds journal.chapters from the full list the client sent. Order is the position in the list.
// An item with cid keeps that chapter (and its entries), an item without cid becomes a new chapter.
// Throws if the list does not match the stored chapters, which aborts the transaction.
const applyChapterList = (journal, chapterList) => {
    const existing = new Map(journal.chapters.map(chapter => [chapter._id.toString(), chapter]))

    for (const { cid } of chapterList) {
        if (cid && !existing.has(cid)) {
            const error = new Error(`Chapter does not belong to this journal: ${cid}`)
            error.statusCode = 400
            throw error
        }
    }

    // Duplicates were rejected by validation, so equal counts means every existing chapter was sent.
    // A smaller count means a chapter is missing, e.g. another tab added one. Chapters are never deleted from this list.
    if (chapterList.filter(item => item.cid).length !== existing.size) {
        const error = new Error("chapters must include every existing chapter exactly once")
        error.statusCode = 409
        throw error
    }

    journal.chapters = chapterList.map((item, index) => {
        if (!item.cid) return { title: item.title, order: index + 1 } // New chapter

        const chapter = existing.get(item.cid)
        chapter.title = item.title
        chapter.order = index + 1
        return chapter
    })
}

// For PATCH "/api/journals/:jid"
// A visibility change rewrites entries that the new journal visibility does not allow.
// "chapters" adds, renames and reorders chapters in the same save. Deleting a chapter stays on its own route.
const updateJournal = async (req, res) => {
    const session = await mongoose.startSession()
    let updatedJournal
    let refreshSummary = false

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
            if (!journal) {
                const error = new Error("Journal does not exist")
                error.statusCode = 404
                throw error
            }

            const { chapters, ...updates } = req.validatedBody // The chapter list is applied separately

            // Summary input is the journal text plus chapter titles and order. Visibility and comments do not change that text.
            refreshSummary = Boolean(chapters) || ["title", "about", "category", "progress"]
                .some(field => updates[field] !== undefined) //  Return true if any item does not match the condition

            const nextVisibility = updates.visibility || journal.visibility
            const commentsAllowed = commentsAllowedForVisibility(nextVisibility, updates.commentsAllowed)

            // For 'private' Journal, commentsAllowed=false, including a journal that was already private.
            if (commentsAllowed === undefined) {
                delete updates.commentsAllowed
            } else {
                updates.commentsAllowed = commentsAllowed
            }

            if (updates.visibility && updates.visibility !== journal.visibility) {
                const entryUpdate = { visibility: updates.visibility }
                if (updates.visibility === "private") {
                    entryUpdate.commentsAllowed = false
                }

                await Entry.updateMany(
                    {
                        journalId: journal._id,
                        visibility: { $nin: ENTRY_VISIBILITY_BY_JOURNAL[updates.visibility] } // Matches entries whose visibility the new journal visibility forbids.
                    },
                    { $set: entryUpdate }, // entries adopt the journal's new visibility.
                    { session }
                )

                // Comments are not allowed in Private entries
                if (updates.visibility === "private") {
                    await Entry.updateMany(
                        { journalId: journal._id, commentsAllowed: true },
                        { $set: { commentsAllowed: false } },
                        { session }
                    )
                }
            }

            Object.assign(journal, updates) // Copy only the fields the client sent

            if (chapters) applyChapterList(journal, chapters) // A bad list aborts the transaction, including the entry rewrite above.

            updatedJournal = await journal.save({ session }) // Returns the saved document, which is sent back to the client.
        })
    } finally {
        await session.endSession()
    }

    // After commit. A failed update throws before this line, so a rejected patch does not call the summary API.
    // Waits for the new summary so the response has it. If the summary fails, data keeps the old aiSummary.
    if (refreshSummary) {
        const summary = await refreshJournalSummary(req.journal._id)
        if (summary) updatedJournal.aiSummary = summary
    }

    res.status(200).json({ message: "Journal updated successfully", data: updatedJournal })
}

// For DELETE "/api/journals/:jid"
const deleteJournal = async (req, res) => {
    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const entries = await Entry.find({ journalId: req.journal._id }, { _id: 1 }, { session }).lean() // We only need the ids
            const entryIds = entries.map(entry => entry._id)

            // Full Cleanup, one operation at a time. A transaction does not support parallel operations on its session.
            await Like.deleteMany({ entryId: { $in: entryIds } }, { session })
            await Bookmark.deleteMany({ entryId: { $in: entryIds } }, { session })
            await Comment.deleteMany({ journalId: req.journal._id }, { session })
            await Follow.deleteMany({ journalId: req.journal._id }, { session })
            await Entry.deleteMany({ journalId: req.journal._id }, { session })

            const deleted = await Journal.deleteOne({ _id: req.journal._id, authorId: req.userObj._id }, { session })
            if (!deleted.deletedCount) {
                const error = new Error("Journal does not exist")
                error.statusCode = 404
                throw error
            }
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


