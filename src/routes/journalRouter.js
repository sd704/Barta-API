const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { userIdValidation } = require("../middleware/userIdValidation")
const { validateIds, validateJournalQuery, validateCreateJournal, validateUpdateJournal, validateChapterBody, validateChapterReorderBody } = require("../middleware/journalValidation")
const { loadJournal, requireJournalAuthor, resolveJournalAccess } = require("../middleware/journalAccess")
const { getOwnJournals, getUserJournals, getJournal, createJournal, updateJournal, deleteJournal } = require("../controller/journalController")
const { getChapters, addChapter, updateChapter, deleteChapter, reorderChapters } = require("../controller/chapterController")
const journalRouter = express.Router()

journalRouter.get("/api/journals",
    tokenAuth, validateJournalQuery, getOwnJournals)

journalRouter.get("/api/users/:uid/journals",
    tokenAuth, validateIds("uid"), validateJournalQuery, userIdValidation, getUserJournals)

journalRouter.post("/api/journals",
    tokenAuth, validateCreateJournal, createJournal)

journalRouter.get("/api/journals/:jid",
    tokenAuth, validateIds("jid"), loadJournal, resolveJournalAccess, getJournal)

journalRouter.patch("/api/journals/:jid",
    tokenAuth, validateIds("jid"), validateUpdateJournal, loadJournal, requireJournalAuthor, updateJournal)

journalRouter.delete("/api/journals/:jid",
    tokenAuth, validateIds("jid"), loadJournal, requireJournalAuthor, deleteJournal)

journalRouter.get("/api/journals/:jid/chapters",
    tokenAuth, validateIds("jid"), loadJournal, requireJournalAuthor, getChapters)

journalRouter.post("/api/journals/:jid/chapters",
    tokenAuth, validateIds("jid"), validateChapterBody, loadJournal, requireJournalAuthor, addChapter)

journalRouter.patch("/api/journals/:jid/chapters/reorder",
    tokenAuth, validateIds("jid"), validateChapterReorderBody, loadJournal, requireJournalAuthor, reorderChapters)

journalRouter.patch("/api/journals/:jid/chapters/:cid",
    tokenAuth, validateIds("jid", "cid"), validateChapterBody, loadJournal, requireJournalAuthor, updateChapter)

journalRouter.delete("/api/journals/:jid/chapters/:cid",
    tokenAuth, validateIds("jid", "cid"), loadJournal, requireJournalAuthor, deleteChapter)

module.exports = journalRouter
