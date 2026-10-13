const { Comment } = require("../model/comment")
const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { BlockList } = require("../model/blocklist")
const { requireEntriesAccess, requireEntryReadAccess } = require("./journalAccess")

// Comment access check -> Used after resolveJournalAccess/requireEntriesAccess
const requireCommentAccess = (req, res, next) => {
    if (req.journalAccess.mode === "full") {
        return next()
    }
    return res.status(403).json({ message: "Comments are available after you receive access to this journal" })
}

// Check is comment allowed on Journal/Entry
const requireCommentsOpen = (req, res, next) => {
    if (req.journal.visibility === "private") return res.status(403).json({ message: "Comments are not allowed on a private journal" })
    if (!req.journal.commentsAllowed) return res.status(403).json({ message: `Comments are turned off for "${req.journal.title}"` })
    if (req.entry && req.entry.visibility === "private") return res.status(403).json({ message: "Comments are not allowed on a private entry" })
    if (req.entry && !req.entry.commentsAllowed) return res.status(403).json({ message: `Comments are turned off for "${req.entry.title}"` })
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
        const entry = await Entry.findById(entryId)
        if (!entry) return res.status(404).json({ message: "Entry does not exist" })

        const journal = await Journal.findById(entry.journalId)
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
    if (!req.entry) return requireCommentAccess(req, res, next) // Journal comment. Full journal access is enough.

    // Entry comment. A preview or teaser reader is turned away before the entry itself is checked.
    if (req.journalAccess.mode !== "full") return requireEntriesAccess(req, res, next)
    requireEntryReadAccess(req, res, next)
}

// Check comment visibility
const requireVisibleComment = async (req, res, next) => {

    // Comment is always visible to author
    if (req.journal.authorId.equals(req.userObj._id)) return next()

    // Return 404 for regular users if hidden
    if (req.comment.isHidden) return res.status(404).json({ message: "Comment does not exist" })

    // If parent comment is hidden, all child comment are also hidden
    if (req.comment.parentId) {
        const parent = await Comment.findById(req.comment.parentId).select("isHidden").lean()
        if (!parent || parent.isHidden) return res.status(404).json({ message: "Comment does not exist" })
    }

    // If block exists between Viewer and Commentator, they can't view the comment
    const participants = [req.userObj._id.toString(), req.comment.userId.toString()].sort().join("|")
    const blocked = await BlockList.exists({ participants })
    if (blocked) return res.status(404).json({ message: "Comment does not exist" })

    next()
}

module.exports = {
    requireCommentAccess,
    requireCommentsOpen,
    loadCommentById,
    loadCommentParent,
    requireScopedCommentAccess,
    requireVisibleComment
}

