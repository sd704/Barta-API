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
    loadJournal,
    rejectJournalAuthor("You cannot like or save your own entry"),
    resolveJournalAccess,
    requireEntriesAccess,
    loadEntry,
    requireEntryReadAccess
]

engagementRouter.post("/api/journals/:jid/follow",
    tokenAuth, validateIds("jid"), validateNoFields, loadJournal, rejectJournalAuthor(REJECT_MSG("follow")), resolveJournalAccess, followJournal)

engagementRouter.delete("/api/journals/:jid/follow",
    tokenAuth, validateIds("jid"), validateNoFields, loadJournal, rejectJournalAuthor(REJECT_MSG("unfollow")), unfollowJournal)

engagementRouter.get("/api/journals/:jid/followers",
    tokenAuth, validateIds("jid"), validateFollowerQuery, loadJournal, resolveJournalAccess, getFollowers)

engagementRouter.patch("/api/journals/:jid/followers/:uid",
    tokenAuth, validateIds("jid", "uid"), validateFollowDecision, loadJournal, requireJournalAuthor, reviewFollower)

engagementRouter.get("/api/library/journals",
    tokenAuth, validateLibraryQuery, getFollowedJournals)

engagementRouter.post("/api/journals/:jid/entries/:eid/like",
    tokenAuth, validateIds("jid", "eid"), validateNoFields, ...entryGuards, likeEntry)

engagementRouter.delete("/api/journals/:jid/entries/:eid/like",
    tokenAuth, validateIds("jid", "eid"), validateNoFields, ...entryGuards, unlikeEntry)

engagementRouter.post("/api/journals/:jid/entries/:eid/save",
    tokenAuth, validateIds("jid", "eid"), validateNoFields, ...entryGuards, saveEntry)

engagementRouter.delete("/api/journals/:jid/entries/:eid/save",
    tokenAuth, validateIds("jid", "eid"), validateNoFields, ...entryGuards, unsaveEntry)

engagementRouter.get("/api/library/bookmarks",
    tokenAuth, validateLibraryQuery, getSavedEntries)

module.exports = engagementRouter

