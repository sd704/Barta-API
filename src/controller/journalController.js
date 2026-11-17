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
const { canReadEntryWithAccess, resolveAccessMode } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { refreshJournalSummary } = require("../services/journalSummaryService")
const { incrementFollowerCount } = require("../services/followCounter")
const { httpError } = require("../utils/httpError")
const { participantKey } = require("../utils/participantKey")
const { runInTransaction } = require("../utils/transaction")

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

// Fields a reader without full access does not get. Preview (selected journal) and teaser (subscribed journal) leave them out.
// Used by the single journal and by the user's journal list, so both show the same thing for the same reader.
const LIMITED_VIEW_FIELDS = ["progress", "endedAt", "lastEntryAt", "aiSummary"]

// Sets journal.view to the reader's access mode and, when that is not "full", removes LIMITED_VIEW_FIELDS.
const applyAccessView = (journal, mode) => {
    journal.view = mode // Full, Preview or Teaser

    if (mode !== "full") {
        for (const field of LIMITED_VIEW_FIELDS) {
            delete journal[field]
        }
    }
    return journal
}

// For GET "/api/users/:uid/journals"
// Lists every journal of that user except private ones, so a selected or subscribed journal can be found and requested.
// Each item is as much as the reader may open: "full", "preview" (selected, not approved) or "teaser" (subscribed, not paid).
// A friends-only journal is only in the list for a friend. It is left out of the query, so a non-friend cannot see it in the list or in the total.
const getUserJournals = async (req, res) => {
    const authorId = req.params.uid
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    if (userId.equals(authorId)) return getOwnJournals(req, res)

    const participants = participantKey(userId, authorId)

    // Check Connection with user
    const [blocked, connection, subscribed] = await Promise.all([
        BlockList.exists({ participants }),
        Connection.exists({ participants, status: "accepted" }),
        Subscription.exists({ subscriberId: userId, authorId })
    ])

    if (blocked) return res.status(404).json({ message: "User not found!" })

    const visibilities = ["public", "selected", "subscribed"]
    if (connection) {
        visibilities.push("friends")
    }

    const query = { authorId, visibility: { $in: visibilities } }

    if (req.query.status) {
        query.status = req.query.status
    }

    // pinned is the author's own ordering. Readers neither see it nor get journals sorted by it.
    const sort = { ...SORTS[req.journalSort] }
    delete sort.pinned

    const [journals, total] = await Promise.all([
        Journal.find(query).select("-chapters -pinned").sort(sort).skip(skip).limit(limit).lean(), // Exclude Chapters
        Journal.countDocuments(query)
    ])

    // Only the selected journals on this page need the follow check. An active follow is an approved one.
    const selectedIds = journals.filter(journal => journal.visibility === "selected").map(journal => journal._id)
    const follows = selectedIds.length
        ? await Follow.find({ followerId: userId, status: "active", journalId: { $in: selectedIds } }).select("journalId").lean()
        : []
    const followedIds = new Set(follows.map(follow => follow.journalId.toString()))

    const data = journals.map(journal => {
        const mode = resolveAccessMode(journal, {
            isFriend: Boolean(connection),
            isFollower: followedIds.has(journal._id.toString()),
            isSubscriber: Boolean(subscribed)
        })
        return applyAccessView(journal, mode)
    })

    res.status(200).json(paginatedResponse("User journals", data, total, page, limit))
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

    applyAccessView(journal, access.mode) // Sets view, and drops the fields a preview or teaser does not get

    if (!access.isAuthor) {
        delete journal.pinned // Only the author's own journal routes include pinned.
    }

    journal.chapters = journal.chapters
        .sort((a, b) => a.order - b.order)
        .map(chapter => {

            const chapterEntries = entriesByChapter.get(chapter._id.toString()) || [] // Specific Chapter Entries

            if (access.mode === "preview") {
                return { ...chapter, entries: [], hiddenEntryCount: chapterEntries.length } // Every entry is hidden, so the list stays empty.
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
    const journalData = { ...req.validatedBody, authorId: req.userObj._id }
    const visibility = journalData.visibility || "private" // A new journal with no visibility is private.

    // Not a transaction, so the 400 is sent here. commentsAllowedForVisibility throws the same rule inside updateJournal.
    if (visibility === "private" && journalData.commentsAllowed === true) {
        return res.status(400).json({ message: "Comments are not allowed when visibility is private" })
    }

    const commentsAllowed = commentsAllowedForVisibility(visibility, journalData.commentsAllowed)

    if (commentsAllowed === undefined) {
        delete journalData.commentsAllowed // Non-private journals keep the schema default when omitted.
    } else {
        journalData.commentsAllowed = commentsAllowed // Private stores false, overriding the schema default of true.
    }

    const journal = await Journal.create(journalData)
    res.status(201).json({ message: "Journal created successfully", data: journal })
}

// Rebuilds journal.chapters from the full list the client sent. Order is the position in the list.
// An item with cid keeps that chapter (and its entries), an item without cid becomes a new chapter.
// Throws if the list does not match the stored chapters, which aborts the transaction.
const applyChapterList = (journal, chapterList) => {
    const existing = new Map(journal.chapters.map(chapter => [chapter._id.toString(), chapter]))

    for (const { cid } of chapterList) {
        if (cid && !existing.has(cid)) throw httpError(400, `Chapter does not belong to this journal: ${cid}`)
    }

    // Duplicates were rejected by validation, so equal counts means every existing chapter was sent.
    // A smaller count means a chapter is missing, e.g. another tab added one. Chapters are never deleted from this list.
    if (chapterList.filter(item => item.cid).length !== existing.size) {
        throw httpError(409, "chapters must include every existing chapter exactly once")
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
    // Summary input is the journal text plus chapter titles and order. Visibility and comments do not change that text.
    const refreshSummary = ["chapters", "title", "about", "category", "progress"]
        .some(field => req.validatedBody[field] !== undefined)

    const updatedJournal = await runInTransaction(async session => {
        const journal = await Journal.findOne({ _id: req.journal._id, authorId: req.userObj._id }).session(session)
        if (!journal) throw httpError(404, "Journal does not exist")

        const { chapters, ...updates } = req.validatedBody // The chapter list is applied separately

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

            // Nobody needs approval on a public journal, so everyone who was waiting is approved now.
            if (updates.visibility === "public") {
                const approved = await Follow.updateMany(
                    { journalId: journal._id, status: "pending" },
                    { $set: { status: "active" } },
                    { session }
                )
                if (approved.modifiedCount) {
                    journal.$inc("followerCount", approved.modifiedCount) // Only active followers are counted.
                }
            }

        }

        Object.assign(journal, updates) // Copy only the fields the client sent

        if (chapters) applyChapterList(journal, chapters) // A bad list aborts the transaction, including the entry rewrite above.

        return journal.save({ session }) // Returns the saved document, which is sent back to the client.
    })

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
    await runInTransaction(async session => {
        const entries = await Entry.find({ journalId: req.journal._id }, { _id: 1 }, { session }).lean() // We only need the ids
        const entryIds = entries.map(entry => entry._id)

        // Full Cleanup, one operation at a time. A transaction does not support parallel operations on its session.
        await Like.deleteMany({ entryId: { $in: entryIds } }, { session })
        await Bookmark.deleteMany({ entryId: { $in: entryIds } }, { session })
        await Comment.deleteMany({ journalId: req.journal._id }, { session })
        await Follow.deleteMany({ journalId: req.journal._id }, { session })
        await Entry.deleteMany({ journalId: req.journal._id }, { session })

        const deleted = await Journal.deleteOne({ _id: req.journal._id, authorId: req.userObj._id }, { session })
        if (!deleted.deletedCount) throw httpError(404, "Journal does not exist")
    })

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