const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateNoFields, validateLibraryQuery, validateFollowerQuery, validateFollowDecision } = require("../middleware/engagementValidation")
const { loadJournal, requireJournalAuthor, rejectJournalAuthor, resolveJournalAccess, requireEntriesAccess, loadEntry, requireEntryReadAccess } = require("../middleware/journalAccess")
const { followJournal, unfollowJournal, getFollowers, reviewFollower } = require("../controller/followController")
const { likeEntry, unlikeEntry, saveEntry, unsaveEntry } = require("../controller/interactionController")
const { getFollowedJournals, getSavedEntries } = require("../controller/libraryController")
const REJECT_MSG = txt => `You cannot ${txt} your own journal`
const engagementRouter = express.Router()

const entryGuards = [
    tokenAuth,
    loadJournal,
    rejectJournalAuthor("You cannot like or save your own entry"),
    resolveJournalAccess,
    requireEntriesAccess,
    loadEntry,
    requireEntryReadAccess
]

engagementRouter.post("/api/journals/:jid/follow", validateIds("jid"), validateNoFields, tokenAuth, loadJournal, rejectJournalAuthor(REJECT_MSG("follow")), resolveJournalAccess, followJournal)

engagementRouter.delete("/api/journals/:jid/follow", validateIds("jid"), validateNoFields, tokenAuth, loadJournal, rejectJournalAuthor(REJECT_MSG("unfollow")), unfollowJournal)

engagementRouter.get("/api/journals/:jid/followers", validateIds("jid"), validateFollowerQuery, tokenAuth, loadJournal, resolveJournalAccess, getFollowers)

engagementRouter.patch("/api/journals/:jid/followers/:uid", validateIds("jid", "uid"), validateFollowDecision, tokenAuth, loadJournal, requireJournalAuthor, reviewFollower)

engagementRouter.get("/api/library/journals", validateLibraryQuery, tokenAuth, getFollowedJournals)

engagementRouter.post("/api/journals/:jid/entries/:eid/like", validateIds("jid", "eid"), validateNoFields, ...entryGuards, likeEntry)

engagementRouter.delete("/api/journals/:jid/entries/:eid/like", validateIds("jid", "eid"), validateNoFields, ...entryGuards, unlikeEntry)

engagementRouter.post("/api/journals/:jid/entries/:eid/save", validateIds("jid", "eid"), validateNoFields, ...entryGuards, saveEntry)

engagementRouter.delete("/api/journals/:jid/entries/:eid/save", validateIds("jid", "eid"), validateNoFields, ...entryGuards, unsaveEntry)

engagementRouter.get("/api/library/bookmarks", validateLibraryQuery, tokenAuth, getSavedEntries)

module.exports = engagementRouter

