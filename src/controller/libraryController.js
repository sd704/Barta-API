const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Follow } = require("../model/follow")
const { Bookmark } = require("../model/bookmark")
const { User } = require("../model/user")
const { loadRelationships, loadSubscribedAuthorIds } = require("../services/journalReaderContext")
const { canReadJournal, canReadEntry } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { AUTHOR_CARD_FIELDS } = require("../utils/constant")

const getFollowedJournals = async (req, res) => {
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    const follows = await Follow.find({ followerId: userId, status: "active" }).sort({ createdAt: -1 }).lean()

    const journals = await Journal.find({ _id: { $in: follows.map(follow => follow.journalId) } }).select("-chapters").lean()

    const journalById = new Map(journals.map(journal => [journal._id.toString(), journal]))

    const relationships = await loadRelationships(userId, journals.map(journal => journal.authorId))
    const followedIds = new Set(follows.map(follow => follow.journalId.toString()))
    const subscribedAuthorIds = await loadSubscribedAuthorIds(userId, journals.map(journal => journal.authorId))

    const authors = await User.find({
        _id: { $in: journals.map(journal => journal.authorId) }
    }).select(AUTHOR_CARD_FIELDS).lean()

    const authorById = new Map(authors.map(author => [author._id.toString(), author]))

    const visible = follows.flatMap(follow => {
        const journal = journalById.get(follow.journalId.toString())
        if (!journal || !canReadJournal(journal, userId, relationships, followedIds, subscribedAuthorIds)) {
            return []
        }

        return [{ ...journal, author: authorById.get(journal.authorId.toString()) || null, followedAt: follow.createdAt }]
    })

    const hiddenCount = follows.length - visible.length
    let message = "Journals you follow"

    if (!follows.length) message = "You are not following any journals"
    else if (!visible.length) message = "Your followed journals are currently unavailable because their visibility changed"
    else if (hiddenCount) message = "Some followed journals are hidden because their visibility changed"

    res.status(200).json(paginatedResponse(
        message,
        visible.slice(skip, skip + limit),
        visible.length,
        page,
        limit,
        { hiddenCount }
    ))
}

const getSavedEntries = async (req, res) => {
    const userId = req.userObj._id
    const { page, limit, skip } = req.pagination

    const bookmarks = await Bookmark.find({ userId }).sort({ createdAt: -1 }).lean()

    const entries = await Entry.find({ _id: { $in: bookmarks.map(bookmark => bookmark.entryId) } }).select("-body").lean()

    const entryById = new Map(entries.map(entry => [entry._id.toString(), entry]))

    const journals = await Journal.find({ _id: { $in: entries.map(entry => entry.journalId) } }).select("title visibility authorId").lean()

    const journalById = new Map(journals.map(journal => [journal._id.toString(), journal]))

    const [relationships, follows, subscribedAuthorIds] = await Promise.all([
        loadRelationships(userId, journals.map(journal => journal.authorId)),
        Follow.find({ followerId: userId, journalId: { $in: journals.map(journal => journal._id) }, status: "active" }).select("journalId").lean(),
        loadSubscribedAuthorIds(userId, journals.map(journal => journal.authorId))
    ])

    const followedIds = new Set(follows.map(follow => follow.journalId.toString()))

    const visible = bookmarks.flatMap(bookmark => {
        const entry = entryById.get(bookmark.entryId.toString())
        const journal = entry && journalById.get(entry.journalId.toString())

        if (!entry || !journal || !canReadEntry(entry, journal, userId, relationships, followedIds, subscribedAuthorIds)) {
            return []
        }

        return [{
            ...entry,
            journal: { _id: journal._id, title: journal.title, visibility: journal.visibility },
            savedAt: bookmark.createdAt
        }]
    })

    const hiddenCount = bookmarks.length - visible.length
    let message = "Saved entries"

    if (!bookmarks.length) message = "You have not saved any entries"
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

