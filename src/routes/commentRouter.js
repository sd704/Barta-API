const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateCommentListTarget, validateCommentTarget, validateCommentQuery, validateCommentListQuery, validateNewComment, validateCommentCreate, validateCommentUpdate, validateCommentHide } = require("../middleware/engagementValidation")
const { resolveJournalAccess } = require("../middleware/journalAccess")
const { requireCommentsOpen, loadCommentById, loadCommentParent, requireScopedCommentAccess, requireVisibleComment } = require("../middleware/commentAccess")
const { listComments, getComment, createComment, updateComment, hideComment, deleteComment, listReplies, createReply } = require("../controller/commentController")
const commentRouter = express.Router()

const commentContext = [loadCommentById, resolveJournalAccess, requireScopedCommentAccess]
const parentContext = [loadCommentParent, resolveJournalAccess, requireScopedCommentAccess]


commentRouter.get("/api/comments",
    tokenAuth, validateCommentListTarget, ...parentContext, validateCommentListQuery, listComments)

commentRouter.post("/api/comments",
    tokenAuth, validateCommentTarget, ...parentContext, validateNewComment, requireCommentsOpen, createComment)

commentRouter.get("/api/comments/:commentId/replies",
    tokenAuth, validateIds("commentId"), ...commentContext, validateCommentQuery, requireVisibleComment, listReplies)

commentRouter.post("/api/comments/:commentId/replies",
    tokenAuth, validateIds("commentId"), ...commentContext, validateCommentCreate, requireCommentsOpen, requireVisibleComment, createReply)

commentRouter.get("/api/comments/:commentId",
    tokenAuth, validateIds("commentId"), ...commentContext, requireVisibleComment, getComment)

commentRouter.patch("/api/comments/:commentId",
    tokenAuth, validateIds("commentId"), ...commentContext, validateCommentUpdate, updateComment)

commentRouter.patch("/api/comments/hide/:commentId",
    tokenAuth, validateIds("commentId"), ...commentContext, validateCommentHide, hideComment)

commentRouter.delete("/api/comments/:commentId",
    tokenAuth, validateIds("commentId"), ...commentContext, deleteComment)

module.exports = commentRouter

