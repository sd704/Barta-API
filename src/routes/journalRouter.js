const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { userIdFormat, requireUserExists } = require("../middleware/userIdValidation")
const { validateIds } = require("../validation/common")
const { validateJournalQuery } = require("../middleware/journalQueryValidation")
const { validateCreateJournal, validateUpdateJournal } = require("../middleware/journalBodyValidation")
const { loadJournal, requireJournalAuthor, resolveJournalAccess } = require("../middleware/journalAccess")
const { getOwnJournals, getUserJournals, getJournal, createJournal, updateJournal, deleteJournal } = require("../controller/journalController")
const { getChapters, deleteChapter } = require("../controller/chapterController")
const journalRouter = express.Router()

journalRouter.get("/api/journals",
    tokenAuth, validateJournalQuery, getOwnJournals)

journalRouter.get("/api/users/:uid/journals",
    tokenAuth, userIdFormat, validateJournalQuery, requireUserExists, getUserJournals)

journalRouter.post("/api/journals",
    tokenAuth, validateCreateJournal, createJournal)

journalRouter.get("/api/journals/:jid",
    tokenAuth, validateIds("jid"), loadJournal, resolveJournalAccess, getJournal)

journalRouter.patch("/api/journals/:jid",
    tokenAuth, validateIds("jid"), validateUpdateJournal, loadJournal, requireJournalAuthor, updateJournal)

journalRouter.delete("/api/journals/:jid",
    tokenAuth, validateIds("jid"), loadJournal, requireJournalAuthor, deleteJournal)

journalRouter.get("/api/journals/:jid/chapters",
    tokenAuth, validateIds("jid"), loadJournal, resolveJournalAccess, getChapters)

journalRouter.delete("/api/journals/:jid/chapters/:cid",
    tokenAuth, validateIds("jid", "cid"), loadJournal, requireJournalAuthor, deleteChapter)

module.exports = journalRouter