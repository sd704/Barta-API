const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateCommentQuery, validateCommentCreate, validateCommentUpdate, validateCommentHide } = require("../middleware/engagementValidation")
const { loadJournal, resolveJournalAccess, requireEntriesAccess, loadEntry, requireEntryReadAccess } = require("../middleware/journalAccess")
const { requireCommentAccess, requireCommentsOpen, loadScopedComment, requireVisibleComment } = require("../middleware/commentAccess")
const { listComments, getComment, createComment, updateComment, hideComment, deleteComment, listReplies, createReply } = require("../controller/commentController")

const commentRouter = express.Router()
const journalAccess = [tokenAuth, loadJournal, resolveJournalAccess, requireCommentAccess]
const entryAccess = [tokenAuth, loadJournal, resolveJournalAccess, requireEntriesAccess, loadEntry, requireEntryReadAccess]

commentRouter.get("/api/journals/:jid/comments", validateIds("jid"), ...journalAccess, validateCommentQuery, listComments)

commentRouter.post("/api/journals/:jid/comments", validateIds("jid"), ...journalAccess, validateCommentCreate, requireCommentsOpen, createComment)

commentRouter.get("/api/journals/:jid/comments/:commentId/replies", validateIds("jid", "commentId"), ...journalAccess, validateCommentQuery, loadScopedComment, requireVisibleComment, listReplies)

commentRouter.post("/api/journals/:jid/comments/:commentId/replies", validateIds("jid", "commentId"), ...journalAccess, validateCommentCreate, requireCommentsOpen, loadScopedComment, requireVisibleComment, createReply)

commentRouter.get("/api/journals/:jid/comments/:commentId", validateIds("jid", "commentId"), ...journalAccess, loadScopedComment, requireVisibleComment, getComment)

commentRouter.patch("/api/journals/:jid/comments/:commentId", validateIds("jid", "commentId"), ...journalAccess, validateCommentUpdate, loadScopedComment, updateComment)

commentRouter.patch("/api/journals/:jid/comments/hide/:commentId", validateIds("jid", "commentId"), ...journalAccess, validateCommentHide, loadScopedComment, hideComment)

commentRouter.delete("/api/journals/:jid/comments/:commentId", validateIds("jid", "commentId"), ...journalAccess, loadScopedComment, deleteComment)

commentRouter.get("/api/journals/:jid/entries/:eid/comments", validateIds("jid", "eid"), ...entryAccess, validateCommentQuery, listComments)

commentRouter.post("/api/journals/:jid/entries/:eid/comments", validateIds("jid", "eid"), ...entryAccess, validateCommentCreate, requireCommentsOpen, createComment)

commentRouter.get("/api/journals/:jid/entries/:eid/comments/:commentId/replies", validateIds("jid", "eid", "commentId"), ...entryAccess, validateCommentQuery, loadScopedComment, requireVisibleComment, listReplies)

commentRouter.post("/api/journals/:jid/entries/:eid/comments/:commentId/replies", validateIds("jid", "eid", "commentId"), ...entryAccess, validateCommentCreate, requireCommentsOpen, loadScopedComment, requireVisibleComment, createReply)

commentRouter.get("/api/journals/:jid/entries/:eid/comments/:commentId", validateIds("jid", "eid", "commentId"), ...entryAccess, loadScopedComment, requireVisibleComment, getComment)

commentRouter.patch("/api/journals/:jid/entries/:eid/comments/:commentId", validateIds("jid", "eid", "commentId"), ...entryAccess, validateCommentUpdate, loadScopedComment, updateComment)

commentRouter.patch("/api/journals/:jid/entries/:eid/comments/hide/:commentId", validateIds("jid", "eid", "commentId"), ...entryAccess, validateCommentHide, loadScopedComment, hideComment)

commentRouter.delete("/api/journals/:jid/entries/:eid/comments/:commentId", validateIds("jid", "eid", "commentId"), ...entryAccess, loadScopedComment, deleteComment)

module.exports = commentRouter

