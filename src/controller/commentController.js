const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { incrementCommentCount, decrementCommentCount } = require("../services/commentCount")
const { Comment } = require("../model/comment")
const { BlockList } = require("../model/blocklist")
const { httpError } = require("../utils/httpError")
const { loadReaderContextForJournal, blockedUserIds } = require("../services/journalReaderContext")
const { entryInteractionError, fullJournalAccessError } = require("../policy/journalAccessPolicy")
const { paginatedResponse } = require("../utils/apiResponse")
const { PUBLIC_PROFILE_FIELDS } = require("../utils/constant")
const { publicProfile } = require("../utils/publicProfile")

// Comment shape for list, get, create, reply, and update
const formatComment = (comment, author, options = {}) => ({
    _id: comment._id,
    journalId: comment.journalId,
    entryId: comment.entryId, // null on journal level comment
    parentId: comment.parentId, // null on top level comment. Replies point to top level comment
    text: comment.text,
    author, // publicProfile or null if user deleted
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    ...(options.includeModeration ? { isHidden: comment.isHidden } : {}), // for hidden comment, only visible to Journal Author
    ...(options.hiddenByParent !== undefined ? { hiddenByParent: options.hiddenByParent } : {}), // In DB, the reply visibility can stay visible while parent is hidden
    ...(options.replyCount !== undefined ? { replyCount: options.replyCount } : {}) // Omitted on replies
})

// Error message for commentsAllowed=false
const commentsClosedMessage = (journal, entry) => {
    if (journal.visibility === "private") return "Comments are not allowed on a private journal"
    if (entry && entry.visibility === "private") return "Comments are not allowed on a private entry"
    return `Comments are turned off for "${journal.commentsAllowed ? entry.title : journal.title}"`
}

// Recheck journal and entry inside a DB write transaction
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
        const { relationships, followedIds, subscribedAuthorIds } = await loadReaderContextForJournal(userId, journal, session)
        const failure = entry
            ? entryInteractionError(journal, entry, userId, relationships, followedIds, subscribedAuthorIds)
            : fullJournalAccessError(journal, userId, relationships, followedIds, subscribedAuthorIds)

        if (failure) throw httpError(failure.statusCode, failure.message)
    }

    return { journal, entry }
}

// Check journal/entry is private or commentsAllowed=true, Used for create comment and reply comment
const assertWritableContext = async (req, session) => {
    const context = await assertReadableContext(req, session)
    const journalClosed = context.journal.visibility === "private" || !context.journal.commentsAllowed
    const entryClosed = context.entry && (context.entry.visibility === "private" || !context.entry.commentsAllowed)
    if (journalClosed || entryClosed) throw httpError(403, commentsClosedMessage(context.journal, context.entry))
    return context
}

// Populate option for the commenter card. Names, picture, and about. Email and password are never loaded.
// populate runs one extra User query for the whole page, not one query per comment.
const AUTHOR_POPULATE = { path: "author", select: PUBLIC_PROFILE_FIELDS }

// Journal comments have entryId null. Entry comments are pinned to req.entry. This stops the two lists from mixing.
const commentFilter = (req) => ({
    journalId: req.journal._id,
    entryId: req.entry ? req.entry._id : null // In Mongo, { entryId: null } matches null or missing, which is how journal comments are stored.
})

// GET journal comments and GET entry comments. Both routers call this.
const listComments = async (req, res) => {
    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const { page, limit, skip } = req.pagination

    // DB: BlockList lookup for readers only. The author moderates every comment, so the query is skipped.
    const blockedIds = isAuthor ? [] : await blockedUserIds(req.userObj._id)
    const query = { ...commentFilter(req), parentId: null } // parentId null — top-level comments only. Replies are listed separately.

    if (!isAuthor) {
        query.isHidden = false // Readers never receive hidden comments.
        if (blockedIds.length) {
            query.userId = { $nin: blockedIds } // $nin — exclude comments by anyone in a block with this reader.
        }
    }

    const [comments, total] = await Promise.all([
        Comment.find(query).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).populate(AUTHOR_POPULATE).lean(),
        Comment.countDocuments(query) // DB: countDocuments with the same filter — total comments this reader can see.
    ])

    const commentIds = comments.map(comment => comment._id)
    const replyMatch = { parentId: { $in: commentIds } } // Replies of the comments on this page only.
    if (!isAuthor) {
        replyMatch.isHidden = false // Hidden replies do not increase the count a reader sees.
        if (blockedIds.length) {
            replyMatch.userId = { $nin: blockedIds }
        }
    }

    // Get reply count
    // Output: [{ _id: parentId, count }]. A comment with no replies has no row, so the code defaults it to 0.
    const replyCounts = comments.length
        ? await Comment.aggregate([{ $match: replyMatch }, { $group: { _id: "$parentId", count: { $sum: 1 } } }])
        : [] // Skip the aggregate on an empty page.

    const countByParent = new Map(replyCounts.map(item => [item._id.toString(), item.count]))

    // Friends, selected, and subscribed readers only reach this list after the access middleware.
    // Private journals and entries stay readable by the author, but the composer stays closed.
    const commentsOpen = req.journal.visibility !== "private" && req.journal.commentsAllowed && (
        req.entry ? (req.entry.visibility !== "private" && req.entry.commentsAllowed) : true
    )

    let message = "Comments retrieved successfully"
    if (!total && commentsOpen) message = "No comments yet"
    if (!total && !commentsOpen) message = "Comments are turned off"
    if (total && !commentsOpen) message = "Existing comments are shown, and new comments are turned off"

    res.status(200).json(paginatedResponse(
        message,
        comments.map(comment => formatComment(
            comment,
            publicProfile(comment.author),
            { includeModeration: isAuthor, replyCount: countByParent.get(comment._id.toString()) || 0 }
        )),
        total,
        page,
        limit,
        { commentsOpen }
    ))
}

// GET specific journal comment or entry comment. requireVisibleComment already ran for non-authors.
const getComment = async (req, res) => {
    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const comment = req.comment
    let hiddenByParent = false

    // If Journal Author and comment is a reply, get parent comments's isHidden flag
    if (isAuthor && comment.parentId) {
        const parent = await Comment.findById(comment.parentId).select("isHidden").lean()
        hiddenByParent = Boolean(parent?.isHidden)
    }

    const replyQuery = { parentId: comment._id } // To check for existing replies

    // Regular User
    if (!isAuthor) {
        replyQuery.isHidden = false // only get visible comments
        const blockedIds = await blockedUserIds(req.userObj._id) // DB: blocks involving this reader.
        if (blockedIds.length) replyQuery.userId = { $nin: blockedIds }
    }

    // Check existing reply count. If its a reply, the count is undefined
    const [, replyCount] = await Promise.all([
        comment.populate(AUTHOR_POPULATE), // Populate comment with commenter data       
        comment.parentId ? Promise.resolve(undefined) : Comment.countDocuments(replyQuery)
    ])

    res.status(200).json({
        message: "Comment retrieved successfully",
        data: formatComment(comment, publicProfile(comment.author), {
            includeModeration: isAuthor,
            hiddenByParent: isAuthor ? hiddenByParent : undefined,
            replyCount
        })
    })
}

// POST a top-level journal or entry comment. parentId is always null. Replies use createReply.
const createComment = async (req, res) => {
    const session = await mongoose.startSession()
    let createdComment

    try {
        // DB: withTransaction — commit on success, roll back on throw, and retry on transient transaction errors.
        await session.withTransaction(async () => {
            const { entry } = await assertWritableContext(req, session)

            const result = await Comment.create([{
                journalId: req.journal._id,
                entryId: entry ? entry._id : null,
                parentId: null,
                userId: req.userObj._id,
                text: req.validatedBody.text
            }], { session })

            createdComment = result[0]

            // An entry comment increments the entry. A journal comment increments the journal.
            await incrementCommentCount({ journalId: req.journal._id, entryId: entry ? entry._id : null }, session)
        })
    } finally {
        await session.endSession()
    }

    res.status(201).json({
        message: "Your comment was added",
        data: formatComment(createdComment, publicProfile(req.userObj), {
            includeModeration: req.journal.authorId.equals(req.userObj._id),
            replyCount: 0
        })
    })
}

// POST a reply. The parent must be top-level.
const createReply = async (req, res) => {
    const session = await mongoose.startSession()
    let createdComment

    try {
        await session.withTransaction(async () => {
            await assertWritableContext(req, session)

            const parent = await Comment.findById(req.comment._id).session(session)
            if (!parent) throw httpError(404, "Comment does not exist")
            if (parent.parentId) throw httpError(400, "Replies can only be added to the original comment") // Depth stays at two.
            if (parent.isHidden) throw httpError(404, "Comment does not exist") // No new replies while the parent is hidden. The author sees the same 404.

            const isAuthor = req.journal.authorId.equals(req.userObj._id)
            if (!isAuthor) {
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

            createdComment = result[0]

            // A reply follows its parent: an entry reply increments the entry, a journal reply increments the journal.
            await incrementCommentCount({ journalId: parent.journalId, entryId: parent.entryId }, session)
        })
    } finally {
        await session.endSession()
    }

    res.status(201).json({
        message: "Your reply was added",
        data: formatComment(createdComment, publicProfile(req.userObj), { includeModeration: req.journal.authorId.equals(req.userObj._id) })
    })
}

// Message for visibility change.
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

// Reloads the comment inside the transaction and, for a reply.
// requireOpen — text edit. Comments that are turned off reject the edit for the commenter and the journal author.
const loadCommentForChange = async (req, session, { requireOpen = false } = {}) => {
    if (requireOpen) await assertWritableContext(req, session)
    else await assertReadableContext(req, session) // Hide still works after comments are turned off.

    const comment = await Comment.findById(req.comment._id).session(session)
    if (!comment) throw httpError(404, "Comment does not exist")

    // Only for replies. The parent's isHidden decides whether readers can see this reply at all.
    const parent = comment.parentId
        ? await Comment.findById(comment.parentId).select("isHidden").session(session).lean()
        : null

    return {
        comment,
        parentHidden: Boolean(parent?.isHidden),
        isAuthor: req.journal.authorId.equals(req.userObj._id),
        isCommenter: comment.userId.equals(req.userObj._id),
        concealed: comment.isHidden || Boolean(parent?.isHidden)
    }
}

// PATCH Comment text for the person who wrote the comment. The journal author uses the hide route for visibility.
const updateComment = async (req, res) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const { comment, isAuthor, isCommenter, concealed } = await loadCommentForChange(req, session, { requireOpen: true })

            // A stranger who cannot see the comment is not told that it exists.
            if (!isCommenter) {
                throw httpError(
                    !isAuthor && concealed ? 404 : 403,
                    !isAuthor && concealed ? "Comment does not exist" : "You can only edit your own comment"
                )
            }

            if (req.validatedBody.text === comment.text) throw httpError(400, "No changes were made to this comment")

            comment.text = req.validatedBody.text
            await comment.save({ session })
            result = { comment, message: "Your comment was updated" }
        })
    } finally {
        await session.endSession()
    }

    await result.comment.populate(AUTHOR_POPULATE)

    res.status(200).json({
        message: result.message,
        data: formatComment(result.comment, publicProfile(result.comment.author), { includeModeration: req.journal.authorId.equals(req.userObj._id) })
    })
}

// PATCH Comment visibility for the journal author only. The commenter cannot change visibility, unless they are also the journal author. 
// Hiding a parent does not rewrite its replies.
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

            if (req.validatedBody.isHidden === comment.isHidden) throw httpError(400, "No changes were made to this comment")

            comment.isHidden = req.validatedBody.isHidden
            await comment.save({ session })

            result = { comment, message: hideMessage({ nextHidden: comment.isHidden, parentHidden }) }
        })
    } finally {
        await session.endSession()
    }

    await result.comment.populate(AUTHOR_POPULATE)

    res.status(200).json({
        message: result.message,
        data: formatComment(result.comment, publicProfile(result.comment.author), { includeModeration: true })
    })
}

// DELETE Comment for the commenter. A top-level delete also deletes replies and subtracts every deleted row from entry.commentCount.
const deleteComment = async (req, res) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            await assertReadableContext(req, session)

            const comment = await Comment.findOne({ _id: req.comment._id, userId: req.userObj._id }).session(session)

            if (!comment) throw httpError(403, "Only the comment author can delete this comment.")

            // Delete where id == comment._id or id == parent._id
            const deleted = await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] }, { session })

            await decrementCommentCount(
                { journalId: comment.journalId, entryId: comment.entryId },
                deleted.deletedCount,
                session
            )

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

// GET replies under a top-level comment. The same handler serves journal and entry routes.
const listReplies = async (req, res) => {
    if (req.comment.parentId) {
        return res.status(400).json({ message: "This comment is a reply and does not have its own reply thread" })
    }

    const isAuthor = req.journal.authorId.equals(req.userObj._id)
    const { page, limit, skip } = req.pagination
    const blockedIds = isAuthor ? [] : await blockedUserIds(req.userObj._id) // DB: blocks involving this reader. Skipped for the author.
    const query = { parentId: req.comment._id } // Replies of this comment. parentId is enough to find them.


    if (!isAuthor) {
        query.isHidden = false
        if (blockedIds.length) {
            query.userId = { $nin: blockedIds }
        }
    }

    const [replies, total] = await Promise.all([
        Comment.find(query).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).populate(AUTHOR_POPULATE).lean(),
        Comment.countDocuments(query) // DB: total visible replies for pagination.
    ])

    res.status(200).json(paginatedResponse(
        total ? "Replies retrieved successfully" : "No replies yet",
        replies.map(reply => formatComment(
            reply,
            publicProfile(reply.author),
            { includeModeration: isAuthor } // No replyCount. A reply is the bottom of the thread.
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

