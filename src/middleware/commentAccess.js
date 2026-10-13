const { Comment } = require("../model/comment")
const { BlockList } = require("../model/blocklist")

// Comment access check -> Used after resolveJournalAccess/requireEntriesAccess
const requireCommentAccess = (req, res, next) => {
    if (req.journalAccess.mode === "full") {
        return next()
    }
    return res.status(403).json({ message: "Comments are available after you receive access to this journal" })
}

// Check is comment allowed on Journal/Entry
const requireCommentsOpen = (req, res, next) => {
    if (!req.journal.commentsAllowed) return res.status(403).json({ message: `Comments are turned off for "${req.journal.title}"` })
    if (req.entry && !req.entry.commentsAllowed) return res.status(403).json({ message: `Comments are turned off for "${req.entry.title}"` })
    next()
}

// Find Comment using req.params.commentId, scoped inside Journal/Entry
const loadScopedComment = async (req, res, next) => {
    const comment = await Comment.findOne({ _id: req.params.commentId, journalId: req.journal._id, entryId: (req.entry ? req.entry._id : null) })

    if (!comment) return res.status(404).json({ message: "Comment does not exist" })

    req.comment = comment
    next()
}

// Check comment visibility
const requireVisibleComment = async (req, res, next) => {

    // Comment is always visible to author
    if (req.journal.authorId.equals(req.userObj._id)) return next()

    // Return 404 for regular users if hidden
    if (req.comment.isHidden) return res.status(404).json({ message: "Comment does not exist" })

    // If parent comment is hidden, all child comment are also hidden
    if (req.comment.parentId) {
        const parent = await Comment.findOne({ _id: req.comment.parentId, journalId: req.journal._id }).select("isHidden").lean()
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
    loadScopedComment,
    requireVisibleComment
}
