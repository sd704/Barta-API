const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateEntryQuery, validateCreateEntry, validateUpdateEntry } = require("../middleware/entryValidation")
const { loadJournal, requireJournalAuthor, resolveJournalAccess, requireEntriesAccess, loadEntryJournal, requireEntryReadAccess } = require("../middleware/journalAccess")
const { getEntries, getEntry, createEntry, updateEntry, deleteEntry } = require("../controller/entryController")
const entryRouter = express.Router()

entryRouter.get("/api/journals/:jid/entries",
    tokenAuth, validateIds("jid"), validateEntryQuery, loadJournal, resolveJournalAccess, requireEntriesAccess, getEntries)

entryRouter.post("/api/journals/:jid/entries",
    tokenAuth, validateIds("jid"), validateCreateEntry, loadJournal, requireJournalAuthor, createEntry)

entryRouter.get("/api/entries/:eid",
    tokenAuth, validateIds("eid"), loadEntryJournal, resolveJournalAccess, requireEntriesAccess, requireEntryReadAccess, getEntry)

entryRouter.patch("/api/entries/:eid",
    tokenAuth, validateIds("eid"), validateUpdateEntry, loadEntryJournal, requireJournalAuthor, updateEntry)

entryRouter.delete("/api/entries/:eid",
    tokenAuth, validateIds("eid"), loadEntryJournal, requireJournalAuthor, deleteEntry)

module.exports = entryRouter

