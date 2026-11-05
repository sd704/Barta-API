const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { validateIds } = require("../middleware/journalValidation")
const { validateNoFields, validateLibraryJournalsQuery, validateLibraryBookmarksQuery, validateFollowerQuery, validateFollowDecision } = require("../middleware/engagementValidation")
const { loadJournal, requireJournalAuthor, rejectJournalAuthor, resolveJournalAccess, requireEntriesAccess, loadEntryJournal, requireEntryReadAccess } = require("../middleware/journalAccess")
const { followJournal, unfollowJournal, getFollowers, reviewFollower } = require("../controller/followController")
const { likeEntry, unlikeEntry, saveEntry, unsaveEntry } = require("../controller/interactionController")
const { getFollowedJournals, getSavedEntries } = require("../controller/libraryController")
const REJECT_MSG = txt => `You cannot ${txt} your own journal`
const engagementRouter = express.Router()

const reactionGuards = [
    loadEntryJournal,
    rejectJournalAuthor("You cannot like or save your own entry"),
    resolveJournalAccess,
    requireEntriesAccess,
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

engagementRouter.post("/api/entries/:eid/like",
    tokenAuth, validateIds("eid"), validateNoFields, ...reactionGuards, likeEntry)

engagementRouter.delete("/api/entries/:eid/like",
    tokenAuth, validateIds("eid"), validateNoFields, ...reactionGuards, unlikeEntry)

engagementRouter.post("/api/entries/:eid/save",
    tokenAuth, validateIds("eid"), validateNoFields, ...reactionGuards, saveEntry)

engagementRouter.delete("/api/entries/:eid/save",
    tokenAuth, validateIds("eid"), validateNoFields, ...reactionGuards, unsaveEntry)

engagementRouter.get("/api/library/journals",
    tokenAuth, validateLibraryJournalsQuery, getFollowedJournals)

engagementRouter.get("/api/library/bookmarks",
    tokenAuth, validateLibraryBookmarksQuery, getSavedEntries)

module.exports = engagementRouter

