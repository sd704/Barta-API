const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateEntryQuery, validateCreateEntry, validateUpdateEntry } = require("../middleware/entryValidation")
const { loadJournal, requireJournalAuthor, resolveJournalAccess, requireEntriesAccess, loadEntry, requireEntryReadAccess } = require("../middleware/journalAccess")
const { getEntries, getEntry, createEntry, updateEntry, deleteEntry } = require("../controller/entryController")
const entryRouter = express.Router()

entryRouter.get("/api/journals/:jid/entries",
    tokenAuth, validateIds("jid"), validateEntryQuery, loadJournal, resolveJournalAccess, requireEntriesAccess, getEntries)

entryRouter.get("/api/journals/:jid/entries/:eid",
    tokenAuth, validateIds("jid", "eid"), loadJournal, resolveJournalAccess, requireEntriesAccess, loadEntry, requireEntryReadAccess, getEntry)

entryRouter.post("/api/journals/:jid/entries",
    tokenAuth, validateIds("jid"), validateCreateEntry, loadJournal, requireJournalAuthor, createEntry)

entryRouter.patch("/api/journals/:jid/entries/:eid",
    tokenAuth, validateIds("jid", "eid"), validateUpdateEntry, loadJournal, requireJournalAuthor, loadEntry, updateEntry)

entryRouter.delete("/api/journals/:jid/entries/:eid",
    tokenAuth, validateIds("jid", "eid"), loadJournal, requireJournalAuthor, loadEntry, deleteEntry)

module.exports = entryRouter

