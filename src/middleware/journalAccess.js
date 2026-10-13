const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { loadAccessFlagsForJournal } = require("../services/journalReaderContext")
const { resolveAccessMode, canReadEntryWithAccess } = require("../policy/journalAccessPolicy")

// Load Journal from DB for Routes with :jid
const loadJournal = async (req, res, next) => {
    const journal = await Journal.findById(req.params.jid)
    if (!journal) return res.status(404).json({ message: "Journal does not exist" })
    req.journal = journal // Pass Journal object to next middleware/controller
    next()
}

// For Routes that require Author access
const requireJournalAuthor = (req, res, next) => {
    if (!req.journal.authorId.equals(req.userObj._id)) {
        return res.status(403).json({ message: "Only the journal author can perform this action" })
    }
    next()
}

// Give access based on specific user
const resolveJournalAccess = async (req, res, next) => {
    const journal = req.journal
    const userId = req.userObj._id

    // Logged In user is Author, Author has full access
    if (journal.authorId.equals(userId)) {
        req.journalAccess = { mode: "full", isAuthor: true, isFriend: false, isFollower: false, isSubscriber: false }
        return next()
    }

    // DB operation: 3 parallel lookups [block/friend, follow is active?, payment]
    const flags = await loadAccessFlagsForJournal(userId, journal)
    if (flags.isBlocked) return res.status(404).json({ message: "Journal does not exist" }) // Journal unavailable for blocked users

    const mode = resolveAccessMode(journal, flags)
    if (mode === "hidden") return res.status(404).json({ message: "Journal does not exist" }) // Journal unavailable based on user

    req.journalAccess = { mode, isAuthor: false, ...flags }
    next()
}

// Must run after "resolveJournalAccess"
const requireEntriesAccess = (req, res, next) => {
    if (req.journalAccess.mode === "full") {
        return next()
    }
    return res.status(403).json({ message: "Entries are hidden for this journal" })
}

// Load Entry from DB for Routes with :eid 
// Runs after "loadJournal" so we can check if entry belongs to journal
const loadEntry = async (req, res, next) => {
    const entry = await Entry.findOne({ _id: req.params.eid, journalId: req.journal._id })
    if (!entry) return res.status(404).json({ message: "Entry does not exist" })
    req.entry = entry
    next()
}

// Hide Entry if no access, after entry document is loaded (we need entry doc to check access)
// Must run after "loadEntry" and "resolveJournalAccess"
const requireEntryReadAccess = (req, res, next) => {
    if (!canReadEntryWithAccess(req.entry, req.journalAccess)) {
        return res.status(404).json({ message: "Entry does not exist" })
    }
    next()
}

// For Routes that Author cannot access, e.g. like, follow, save
const rejectJournalAuthor = (message) => (req, res, next) => {
    if (req.journal.authorId.equals(req.userObj._id)) return res.status(403).json({ message })
    next()
}

module.exports = {
    loadJournal,
    requireJournalAuthor,
    resolveJournalAccess,
    requireEntriesAccess,
    loadEntry,
    requireEntryReadAccess,
    rejectJournalAuthor
}

