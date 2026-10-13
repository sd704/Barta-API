const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { httpError } = require("../utils/httpError")
const { loadReaderContextForJournal } = require("../services/journalReaderContext")
const { entryInteractionError } = require("../policy/journalAccessPolicy")

// Shared authorization for like and save, both adding and removing.
const assertEntryInteraction = async (userId, journalId, entryId, session) => {
    const journal = await Journal.findById(journalId).session(session)
    const entry = await Entry.findOne({ _id: entryId, journalId }).session(session)

    if (!journal) throw httpError(404, "Journal does not exist")
    if (!entry) throw httpError(404, "Entry does not exist")

    if (journal.authorId.equals(userId) || entry.authorId.equals(userId)) {
        throw httpError(403, "You cannot like or save your own entry")
    }

    const { relationships, followedIds, subscribedAuthorIds } = await loadReaderContextForJournal(userId, journal, session)
    const failure = entryInteractionError(
        journal,
        entry,
        userId,
        relationships,
        followedIds,
        subscribedAuthorIds
    )

    if (failure) throw httpError(failure.statusCode, failure.message)
    return entry
}

// Insert a Like or Bookmark
const addReaction = async (req, res, options) => {
    const userId = req.userObj._id
    const entryId = req.entry._id

    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            await assertEntryInteraction(userId, req.journal._id, entryId, session)
            await options.Model.create([{ userId, entryId }], { session }) // Model: Like/Bookmark passed as parameter

            if (options.counterField) {
                await Entry.updateOne({ _id: entryId }, { $inc: { [options.counterField]: 1 } }, { session })
            }
        })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: options.duplicateMessage(req.entry.title) })
        throw error
    } finally {
        await session.endSession()
    }

    const updated = await Entry.findById(entryId).select("likeCount").lean() // null if the entry was deleted right after the commit.

    res.status(201).json({
        message: options.createdMessage(req.entry.title),
        data: {
            entryId,
            ...(options.counterField ? { likeCount: updated?.likeCount ?? 0 } : {})
        }
    })
}

// Delete a Like or Bookmark
const removeReaction = async (req, res, options) => {
    const userId = req.userObj._id
    const entryId = req.entry._id

    const session = await mongoose.startSession()
    let title

    try {
        await session.withTransaction(async () => {
            const entry = await assertEntryInteraction(userId, req.journal._id, entryId, session)
            title = entry.title

            const deleted = await options.Model.findOneAndDelete({ userId, entryId }, { session }) // Model: Like/Bookmark passed as parameter

            if (!deleted) throw httpError(404, options.missingMessage(title))

            if (options.counterField) {
                await Entry.updateOne(
                    { _id: entryId, [options.counterField]: { $gt: 0 } },
                    { $inc: { [options.counterField]: -1 } },
                    { session }
                )
            }
        })
    } finally {
        await session.endSession()
    }

    const updated = await Entry.findById(entryId).select("likeCount").lean() // null if the entry was deleted right after the commit.

    res.status(200).json({
        message: options.removedMessage(title),
        data: {
            entryId,
            ...(options.counterField ? { likeCount: updated?.likeCount ?? 0 } : {})
        }
    })
}

// For POST '/like'
const likeEntry = (req, res) => addReaction(req, res, {
    Model: Like,
    counterField: "likeCount",
    createdMessage: title => `You liked "${title}"`,
    duplicateMessage: title => `You have already liked "${title}"`
})

// For DELETE '/like'
const unlikeEntry = (req, res) => removeReaction(req, res, {
    Model: Like,
    counterField: "likeCount",
    removedMessage: title => `You removed your like from "${title}"`,
    missingMessage: title => `You have not liked "${title}"`
})

// For POST '/save'
const saveEntry = (req, res) => addReaction(req, res, {
    Model: Bookmark,
    createdMessage: title => `You saved "${title}"`,
    duplicateMessage: title => `You have already saved "${title}"`
})

// For DELETE '/like'
const unsaveEntry = (req, res) => removeReaction(req, res, {
    Model: Bookmark,
    removedMessage: title => `You removed "${title}" from your saved entries`,
    missingMessage: title => `You have not saved "${title}"`
})

module.exports = {
    likeEntry,
    unlikeEntry,
    saveEntry,
    unsaveEntry
}

