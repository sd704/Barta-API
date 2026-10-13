const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { userIdValidation } = require("../middleware/userIdValidation")
const { validateIds, validateJournalQuery, validateCreateJournal, validateUpdateJournal, validateChapterBody, validateChapterReorderBody } = require("../middleware/journalValidation")
const { loadJournal, requireJournalAuthor, resolveJournalAccess } = require("../middleware/journalAccess")
const { getOwnJournals, getUserJournals, getJournal, createJournal, updateJournal, deleteJournal } = require("../controller/journalController")
const { getChapters, addChapter, updateChapter, deleteChapter, reorderChapters } = require("../controller/chapterController")
const journalRouter = express.Router()

journalRouter.get("/api/journals", validateJournalQuery, tokenAuth, getOwnJournals)

journalRouter.get("/api/users/:uid/journals", validateIds("uid"), validateJournalQuery, tokenAuth, userIdValidation, getUserJournals)

journalRouter.post("/api/journals", validateCreateJournal, tokenAuth, createJournal)

journalRouter.get("/api/journals/:jid", validateIds("jid"), tokenAuth, loadJournal, resolveJournalAccess, getJournal)

journalRouter.patch("/api/journals/:jid", validateIds("jid"), validateUpdateJournal, tokenAuth, loadJournal, requireJournalAuthor, updateJournal)

journalRouter.delete("/api/journals/:jid", validateIds("jid"), tokenAuth, loadJournal, requireJournalAuthor, deleteJournal)

journalRouter.get("/api/journals/:jid/chapters", validateIds("jid"), tokenAuth, loadJournal, requireJournalAuthor, getChapters)

journalRouter.post("/api/journals/:jid/chapters", validateIds("jid"), validateChapterBody, tokenAuth, loadJournal, requireJournalAuthor, addChapter)

journalRouter.patch("/api/journals/:jid/chapters/reorder", validateIds("jid"), validateChapterReorderBody, tokenAuth, loadJournal, requireJournalAuthor, reorderChapters)

journalRouter.patch("/api/journals/:jid/chapters/:cid", validateIds("jid", "cid"), validateChapterBody, tokenAuth, loadJournal, requireJournalAuthor, updateChapter)

journalRouter.delete("/api/journals/:jid/chapters/:cid", validateIds("jid", "cid"), tokenAuth, loadJournal, requireJournalAuthor, deleteChapter)

module.exports = journalRouter
