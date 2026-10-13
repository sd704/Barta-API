const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Follow } = require("../model/follow")
const { Bookmark } = require("../model/bookmark")
const { loadRelationships, loadSubscribedAuthorIds } = require("../services/journalReaderContext")
const { canReadJournal, canReadEntry } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { AUTHOR_CARD_FIELDS } = require("../utils/constant")

// For GET "/api/library/journals"
// Loads every active follow, hides journals the reader can no longer open, then slices the page in memory.
const getFollowedJournals = async (req, res) => {
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    const follows = await Follow.find({ followerId: userId, status: "active" }).sort({ createdAt: -1 }).lean() // most recently followed first
    const journalIds = follows.map(follow => follow.journalId)

    const journals = await Journal.find({ _id: { $in: journalIds } }).select("-chapters").populate({ path: "author", select: AUTHOR_CARD_FIELDS }).lean()
    const journalById = new Map(journals.map(journal => [journal._id.toString(), journal])) // Follow order is preserved by looking up each follow.

    const relationships = await loadRelationships(userId, journals.map(journal => journal.authorId))
    const followedIds = new Set(follows.map(follow => follow.journalId.toString())) // Selected journals are readable because these follows are active.
    const subscribedAuthorIds = await loadSubscribedAuthorIds(userId, journals.map(journal => journal.authorId))

    const status = req.query.status // Optional journal status: active, paused, completed, or archived.
    const visibleJournals = follows.reduce((journals, follow) => {
        const journal = journalById.get(follow.journalId.toString())

        if (!journal || !canReadJournal(journal, userId, relationships, followedIds, subscribedAuthorIds)) {
            return journals // Deleted journal, or visibility changed to private/friends/unsubscribed.
        }

        if (status && journal.status !== status) return journals

        journals.push({ ...journal, author: journal.author || null, followedAt: follow.createdAt })
        return journals
    }, [])

    // Status mismatches are not hidden journals. Count only follows whose journal matches the filter.
    const inFilter = status
        ? follows.filter(follow => journalById.get(follow.journalId.toString())?.status === status)
        : follows
    const hiddenCount = inFilter.length - visibleJournals.length

    let message = "Journals you follow"

    if (!follows.length) message = "You are not following any journals"
    else if (!visibleJournals.length && !hiddenCount) message = "No followed journals match this status"
    else if (!visibleJournals.length) message = "Your followed journals are currently unavailable because their visibility changed"
    else if (hiddenCount) message = "Some followed journals are hidden because their visibility changed"

    res.status(200).json(paginatedResponse(
        message,
        visibleJournals.slice(skip, skip + limit), // Page after filtering, so hidden journals do not leave holes in a page.
        visibleJournals.length,
        page,
        limit,
        { hiddenCount }
    ))
}

// For GET "/api/library/bookmarks". Entry body is omitted. 
const getSavedEntries = async (req, res) => {
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    const bookmarks = await Bookmark.find({ userId }).sort({ createdAt: -1 }).lean() // most recently saved first
    const bookmarkIds = bookmarks.map(bookmark => bookmark.entryId)

    const entries = await Entry.find({ _id: { $in: bookmarkIds } }).select("-body").lean() // remove body
    const entryById = new Map(entries.map(entry => [entry._id.toString(), entry]))
    const journalIds = [...new Set(entries.map(entry => entry.journalId.toString()))]

    const journals = await Journal.find({ _id: { $in: journalIds } }).select("title visibility authorId").lean()
    const journalById = new Map(journals.map(journal => [journal._id.toString(), journal]))

    const [relationships, follows, subscribedAuthorIds] = await Promise.all([
        loadRelationships(userId, journals.map(journal => journal.authorId)),
        Follow.find({ followerId: userId, journalId: { $in: journals.map(journal => journal._id) }, status: "active" }).select("journalId").lean(),
        loadSubscribedAuthorIds(userId, journals.map(journal => journal.authorId))
    ])

    const followedIds = new Set(follows.map(follow => follow.journalId.toString()))
    const type = req.query.type // Optional entry type: journal, decision, milestone, failure, lesson, or launch.

    const visible = bookmarks.reduce((arr, bookmark) => {
        const entry = entryById.get(bookmark.entryId.toString())
        const journal = entry && journalById.get(entry.journalId.toString())

        if (!entry || !journal || !canReadEntry(entry, journal, userId, relationships, followedIds, subscribedAuthorIds)) {
            return arr // Entry or journal deleted, or the reader lost access.
        }

        if (type && entry.type !== type) return arr

        arr.push({
            ...entry,
            journal: { _id: journal._id, title: journal.title, visibility: journal.visibility }, // Small parent card, not the whole journal.
            savedAt: bookmark.createdAt
        })
        return arr
    }, [])

    // Type mismatches are not hidden entries. Count only bookmarks whose entry matches the filter.
    const inFilter = type
        ? bookmarks.filter(bookmark => entryById.get(bookmark.entryId.toString())?.type === type)
        : bookmarks
    const hiddenCount = inFilter.length - visible.length

    let message = "Saved entries"

    if (!bookmarks.length) message = "You have not saved any entries"
    else if (!visible.length && !hiddenCount) message = "No saved entries match this type"
    else if (!visible.length) message = "Your saved entries are currently unavailable because their visibility changed"
    else if (hiddenCount) message = "Some saved entries are hidden because their visibility changed"

    res.status(200).json(paginatedResponse(
        message,
        visible.slice(skip, skip + limit),
        visible.length,
        page,
        limit,
        { hiddenCount }
    ))
}

module.exports = {
    getFollowedJournals,
    getSavedEntries
}
