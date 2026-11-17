const { Comment } = require("../model/comment")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { BlockList } = require("../model/blocklist")
const { commentsClosedMessage } = require("../policy/journalRules")
const { commentScopeError } = require("../policy/journalAccessPolicy")
const { loadEntryWithJournal } = require("../services/entryLoader")
const { participantKey } = require("../utils/participantKey")

// Check is comment allowed on Journal/Entry
const requireCommentsOpen = (req, res, next) => {
    const message = commentsClosedMessage(req.journal, req.entry)
    if (message) {
        return res.status(403).json({ message })
    }
    next()
}

// Loads comment using :commentId, then the journal stored on that comment, and the entry when the comment has one.
const loadCommentById = async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId)
    if (!comment) return res.status(404).json({ message: "Comment does not exist" })

    const journal = await Journal.findById(comment.journalId) // Get related Journal for access checks
    if (!journal) return res.status(404).json({ message: "Journal does not exist" })

    req.comment = comment
    req.journal = journal

    if (!comment.entryId) return next() // Journal-level comment. entryId null means there is no entry to load.

    const entry = await Entry.findById(comment.entryId) // Get related Entry for access checks
    if (!entry) return res.status(404).json({ message: "Entry does not exist" })

    req.entry = entry
    next()
}

// For GET/POST "/api/comments"
const loadCommentParent = async (req, res, next) => {
    const { journalId, entryId } = req.commentTarget

    // For Entry comment
    if (entryId) {
        const { entry, journal } = await loadEntryWithJournal(entryId)
        if (!entry) return res.status(404).json({ message: "Entry does not exist" })
        if (!journal) return res.status(404).json({ message: "Journal does not exist" })

        req.entry = entry
        req.journal = journal
        return next()
    }

    // Journal Comment
    const journal = await Journal.findById(journalId)
    if (!journal) return res.status(404).json({ message: "Journal does not exist" })

    req.journal = journal
    next()
}

// Journal comments need full journal access. Entry comments also need that entry to be readable.
// Must run after resolveJournalAccess, and after req.entry has been set for an entry comment.
const requireScopedCommentAccess = (req, res, next) => {
    const failure = commentScopeError(req.journalAccess, req.entry)
    if (failure) return res.status(failure.statusCode).json({ message: failure.message })
    next()
}

// Check comment visibility. Must run after resolveJournalAccess.
const requireVisibleComment = async (req, res, next) => {

    // Comment is always visible to author
    if (req.journalAccess.isAuthor) return next()

    // Return 404 for regular users if hidden
    if (req.comment.isHidden) return res.status(404).json({ message: "Comment does not exist" })

    // If parent comment is hidden, all child comments are also hidden. The parent author is checked for a block below.
    let parentAuthorId = null
    if (req.comment.parentId) {
        const parent = await Comment.findById(req.comment.parentId).select("isHidden userId").lean()
        if (!parent || parent.isHidden) return res.status(404).json({ message: "Comment does not exist" })
        parentAuthorId = parent.userId
    }

    // A block with the commenter, or with the author of the comment being replied to, hides it.
    // The journal author returned above, so their own journal is not affected.
    const keys = [req.comment.userId, parentAuthorId].filter(Boolean).map(id => participantKey(req.userObj._id, id))
    const blocked = await BlockList.exists({ participants: { $in: keys } })
    if (blocked) return res.status(404).json({ message: "Comment does not exist" })

    next()
}

module.exports = {
    requireCommentsOpen,
    loadCommentById,
    loadCommentParent,
    requireScopedCommentAccess,
    requireVisibleComment
}