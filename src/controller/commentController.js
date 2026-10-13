const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Comment } = require("../model/comment")
const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const { httpError } = require("../utils/httpError")
const { loadReaderContextForJournal, blockedUserIds } = require("../services/journalReaderContext")
const { entryInteractionError, fullJournalAccessError } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { PUBLIC_PROFILE_FIELDS } = require("../utils/constant")
const { publicProfile } = require("../utils/publicProfile")

const formatComment = (comment, author, options = {}) => ({
    _id: comment._id,
    journalId: comment.journalId,
    entryId: comment.entryId,
    parentId: comment.parentId,
    text: comment.text,
    author,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    ...(options.includeModeration ? { isHidden: comment.isHidden } : {}),
    ...(options.hiddenByParent !== undefined ? { hiddenByParent: options.hiddenByParent } : {}),
    ...(options.replyCount !== undefined ? { replyCount: options.replyCount } : {})
})

const commentsClosedMessage = (journal, entry) => `Comments are turned off for "${journal.commentsAllowed ? entry.title : journal.title}"`

const assertReadableContext = async (req, session) => {
    const userId = req.userObj._id
    const journal = await Journal.findById(req.journal._id).session(session)
    if (!journal) throw httpError(404, "Journal does not exist")

    let entry = null
    if (req.entry) {
        entry = await Entry.findOne({ _id: req.entry._id, journalId: journal._id }).session(session)
        if (!entry) throw httpError(404, "Entry does not exist")
    }

    // The author can moderate a private journal. entryInteractionError hides private journals from everyone.
    if (!journal.authorId.equals(userId)) {
        const { relationships, followedIds, subscribedAuthorIds } =
            await loadReaderContextForJournal(userId, journal, session)
        const failure = entry
            ? entryInteractionError(journal, entry, userId, relationships, followedIds, subscribedAuthorIds)
            : fullJournalAccessError(journal, userId, relationships, followedIds, subscribedAuthorIds)

        if (failure) throw httpError(failure.statusCode, failure.message)
    }

    return { journal, entry }
}

const assertWritableContext = async (req, session) => {
    const context = await assertReadableContext(req, session)

    if (!context.journal.commentsAllowed || (context.entry && !context.entry.commentsAllowed)) {
        throw httpError(403, commentsClosedMessage(context.journal, context.entry))
    }

    return context
}

const loadAuthors = async ids => {
    const users = await User.find({ _id: { $in: ids } }).select(PUBLIC_PROFILE_FIELDS).lean()

    return new Map(users.map(user => [user._id.toString(), user]))
}

const commentFilter = (req) => ({
    journalId: req.journal._id,
    entryId: req.entry ? req.entry._id : null
})

const listComments = async (req, res) => {
    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const { page, limit, skip } = req.pagination
    const blockedIds = isAuthor ? [] : await blockedUserIds(req.userObj._id)
    const query = { ...commentFilter(req), parentId: null }

    if (!isAuthor) {
        query.isHidden = false
        if (blockedIds.length) query.userId = { $nin: blockedIds }
    }

    const [comments, total] = await Promise.all([
        Comment.find(query).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
        Comment.countDocuments(query)
    ])

    const replyMatch = { parentId: { $in: comments.map(comment => comment._id) } }
    if (!isAuthor) {
        replyMatch.isHidden = false
        if (blockedIds.length) replyMatch.userId = { $nin: blockedIds }
    }

    const [authors, replyCounts] = await Promise.all([
        loadAuthors(comments.map(comment => comment.userId)),
        comments.length
            ? Comment.aggregate([{ $match: replyMatch }, { $group: { _id: "$parentId", count: { $sum: 1 } } }])
            : []
    ])

    const countByParent = new Map(replyCounts.map(item => [item._id.toString(), item.count]))
    const commentsOpen = req.entry
        ? req.journal.commentsAllowed && req.entry.commentsAllowed
        : req.journal.commentsAllowed

    let message = "Comments retrieved successfully"
    if (!total && commentsOpen) message = "No comments yet"
    if (!total && !commentsOpen) message = "Comments are turned off"
    if (total && !commentsOpen) message = "Existing comments are shown, and new comments are turned off"

    res.status(200).json(paginatedResponse(
        message,
        comments.map(comment => formatComment(
            comment,
            publicProfile(authors.get(comment.userId.toString())),
            {
                includeModeration: isAuthor,
                replyCount: countByParent.get(comment._id.toString()) || 0
            }
        )),
        total,
        page,
        limit,
        { commentsOpen }
    ))
}

const getComment = async (req, res) => {
    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const comment = req.comment
    let hiddenByParent = false

    if (isAuthor && comment.parentId) {
        const parent = await Comment.findOne({ _id: comment.parentId, journalId: req.journal._id }).select("isHidden").lean()
        hiddenByParent = Boolean(parent?.isHidden)
    }

    const replyQuery = { parentId: comment._id }
    if (!isAuthor) {
        replyQuery.isHidden = false
        const blockedIds = await blockedUserIds(req.userObj._id)
        if (blockedIds.length) replyQuery.userId = { $nin: blockedIds }
    }

    const [author, replyCount] = await Promise.all([
        User.findById(comment.userId).select(PUBLIC_PROFILE_FIELDS).lean(),
        comment.parentId ? Promise.resolve(undefined) : Comment.countDocuments(replyQuery)
    ])

    res.status(200).json({
        message: "Comment retrieved successfully",
        data: formatComment(comment, publicProfile(author), {
            includeModeration: isAuthor,
            hiddenByParent: isAuthor ? hiddenByParent : undefined,
            replyCount
        })
    })
}

const createComment = async (req, res) => {
    const session = await mongoose.startSession()
    let created

    try {
        await session.withTransaction(async () => {
            const { entry } = await assertWritableContext(req, session)
            const result = await Comment.create([{
                journalId: req.journal._id,
                entryId: entry ? entry._id : null,
                parentId: null,
                userId: req.userObj._id,
                text: req.validatedBody.text
            }], { session })

            created = result[0]

            if (entry) {
                await Entry.updateOne({ _id: entry._id }, { $inc: { commentCount: 1 } }, { session })
            }
        })
    } finally {
        await session.endSession()
    }

    res.status(201).json({
        message: "Your comment was added",
        data: formatComment(created, publicProfile(req.userObj), {
            includeModeration: req.journal.authorId.equals(req.userObj._id),
            replyCount: 0
        })
    })
}

const createReply = async (req, res) => {
    const session = await mongoose.startSession()
    let created
    let parentHidden = false

    try {
        await session.withTransaction(async () => {
            await assertWritableContext(req, session)

            const parent = await Comment.findOne({ _id: req.comment._id, ...commentFilter(req) }).session(session)

            if (!parent) throw httpError(404, "Comment does not exist")
            if (parent.parentId) throw httpError(400, "Replies can only be added to the original comment")


            const isAuthor = req.journal.authorId.equals(req.userObj._id)
            if (!isAuthor) {
                if (parent.isHidden) throw httpError(404, "Comment does not exist")

                const participants = [req.userObj._id.toString(), parent.userId.toString()].sort().join("|")
                const blocked = await BlockList.exists({ participants }).session(session)
                if (blocked) throw httpError(404, "Comment does not exist")
            }

            const result = await Comment.create([{
                journalId: parent.journalId,
                entryId: parent.entryId,
                parentId: parent._id,
                userId: req.userObj._id,
                text: req.validatedBody.text
            }], { session })

            created = result[0]
            parentHidden = parent.isHidden

            if (parent.entryId) {
                await Entry.updateOne({ _id: parent.entryId }, { $inc: { commentCount: 1 } }, { session })
            }
        })
    } finally {
        await session.endSession()
    }

    res.status(201).json({
        message: parentHidden
            ? "Your reply was added. Readers cannot see it while the original comment is hidden"
            : "Your reply was added",
        data: formatComment(created, publicProfile(req.userObj), { includeModeration: req.journal.authorId.equals(req.userObj._id) })
    })
}

const hideMessage = ({ nextHidden, parentHidden }) => {

    if (nextHidden) {
        return parentHidden
            ? "This reply is now hidden from readers"
            : "This comment and its replies are now hidden from readers"
    }

    return parentHidden
        ? "This reply is marked visible, but readers cannot see it while the original comment is hidden"
        : "This comment is visible to readers again"
}

const loadCommentForChange = async (req, session) => {
    await assertReadableContext(req, session)

    const comment = await Comment.findOne({ _id: req.comment._id, ...commentFilter(req) }).session(session)
    if (!comment) throw httpError(404, "Comment does not exist")

    const parent = comment.parentId
        ? await Comment.findOne({ _id: comment.parentId, journalId: req.journal._id }).select("isHidden").session(session).lean()
        : null

    return {
        comment,
        parentHidden: Boolean(parent?.isHidden),
        isAuthor: req.journal.authorId.equals(req.userObj._id),
        isCommenter: comment.userId.equals(req.userObj._id),
        concealed: comment.isHidden || Boolean(parent?.isHidden)
    }
}

const updateComment = async (req, res) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const { comment, isAuthor, isCommenter, concealed } = await loadCommentForChange(req, session)

            if (!isCommenter) {
                throw httpError(
                    !isAuthor && concealed ? 404 : 403,
                    !isAuthor && concealed ? "Comment does not exist" : "You can only edit your own comment"
                )
            }

            if (req.validatedBody.text === comment.text) {
                throw httpError(400, "No changes were made to this comment")
            }

            comment.text = req.validatedBody.text

            await comment.save({ session })



            result = { comment, message: "Your comment was updated" }
        })
    } finally {
        await session.endSession()
    }

    const author = await User.findById(result.comment.userId).select(PUBLIC_PROFILE_FIELDS).lean()

    res.status(200).json({
        message: result.message,
        data: formatComment(result.comment, publicProfile(author), { includeModeration: req.journal.authorId.equals(req.userObj._id) })
    })
}

const hideComment = async (req, res) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const { comment, parentHidden, isAuthor, isCommenter, concealed } = await loadCommentForChange(req, session)

            if (!isAuthor) {
                throw httpError(
                    !isCommenter && concealed ? 404 : 403,
                    !isCommenter && concealed ? "Comment does not exist" : "Only the journal author can change comment visibility"
                )
            }

            if (req.validatedBody.isHidden === comment.isHidden) {
                throw httpError(400, "No changes were made to this comment")
            }

            comment.isHidden = req.validatedBody.isHidden

            await comment.save({ session })

            result = {
                comment,
                message: hideMessage({ nextHidden: comment.isHidden, parentHidden })
            }
        })
    } finally {
        await session.endSession()
    }

    const author = await User.findById(result.comment.userId).select(PUBLIC_PROFILE_FIELDS).lean()

    res.status(200).json({
        message: result.message,
        data: formatComment(result.comment, publicProfile(author), { includeModeration: true })
    })
}

const deleteComment = async (req, res) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            await assertReadableContext(req, session)

            const comment = await Comment.findOne({ _id: req.comment._id, ...commentFilter(req), userId: req.userObj._id }).session(session)

            if (!comment) {
                throw httpError(403, "Only the comment author can delete this comment. The journal author can hide it instead.")
            }

            const deleted = await Comment.deleteMany({
                journalId: comment.journalId,
                entryId: comment.entryId,
                $or: [{ _id: comment._id }, { parentId: comment._id }]
            }, { session })

            if (comment.entryId) {
                await Entry.updateOne(
                    { _id: comment.entryId },
                    [{
                        $set: {
                            commentCount: {
                                $max: [0, { $subtract: ["$commentCount", deleted.deletedCount] }]
                            }
                        }
                    }],
                    { session }
                )
            }

            result = { deletedCount: deleted.deletedCount, isReply: Boolean(comment.parentId) }
        })
    } finally {
        await session.endSession()
    }

    const message = result.deletedCount > 1
        ? "Your comment and its replies were deleted"
        : result.isReply ? "Your reply was deleted" : "Your comment was deleted"

    res.status(200).json({ message, data: { deletedCount: result.deletedCount } })
}

const listReplies = async (req, res) => {
    if (req.comment.parentId) {
        return res.status(400).json({ message: "This comment is a reply and does not have its own reply thread" })
    }

    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const { page, limit, skip } = req.pagination
    const blockedIds = isAuthor ? [] : await blockedUserIds(req.userObj._id)
    const query = { ...commentFilter(req), parentId: req.comment._id }

    if (!isAuthor) {
        query.isHidden = false
        if (blockedIds.length) query.userId = { $nin: blockedIds }
    }

    const [replies, total] = await Promise.all([
        Comment.find(query).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
        Comment.countDocuments(query)
    ])
    const authors = await loadAuthors(replies.map(reply => reply.userId))

    res.status(200).json(paginatedResponse(
        total ? "Replies retrieved successfully" : "No replies yet",
        replies.map(reply => formatComment(
            reply,
            publicProfile(authors.get(reply.userId.toString())),
            { includeModeration: isAuthor }
        )),
        total,
        page,
        limit
    ))
}

module.exports = {
    listComments,
    getComment,
    createComment,
    updateComment,
    hideComment,
    deleteComment,
    listReplies,
    createReply
}

