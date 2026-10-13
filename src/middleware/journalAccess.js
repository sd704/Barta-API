const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { loadAccessFlagsForJournal } = require("../services/journalReaderContext")
const { resolveAccessMode, canReadEntryWithAccess } = require("../policy/journalAccessPolicy")

const loadJournal = async (req, res, next) => {
    const journal = await Journal.findById(req.params.jid)
    if (!journal) return res.status(404).json({ message: "Journal does not exist" })
    req.journal = journal
    next()
}

const requireJournalAuthor = (req, res, next) => {
    if (!req.journal.authorId.equals(req.userObj._id)) {
        return res.status(403).json({ message: "Only the journal author can perform this action" })
    }
    next()
}

const resolveJournalAccess = async (req, res, next) => {
    const journal = req.journal
    const userId = req.userObj._id

    if (journal.authorId.equals(userId)) {
        req.journalAccess = { mode: "full", isAuthor: true, isFriend: false, isFollower: false, isSubscriber: false }
        return next()
    }

    const flags = await loadAccessFlagsForJournal(userId, journal)
    if (flags.isBlocked) return res.status(404).json({ message: "Journal does not exist" })

    const mode = resolveAccessMode(journal, flags)
    if (mode === "hidden") return res.status(404).json({ message: "Journal does not exist" })

    req.journalAccess = { mode, isAuthor: false, ...flags }
    next()
}

const requireEntriesAccess = (req, res, next) => {
    if (req.journalAccess.mode === "full") {
        return next()
    }
    return res.status(403).json({ message: "Entries are hidden for this journal" })
}

const loadEntry = async (req, res, next) => {
    const entry = await Entry.findOne({ _id: req.params.eid, journalId: req.journal._id })
    if (!entry) return res.status(404).json({ message: "Entry does not exist" })
    req.entry = entry
    next()
}

const requireEntryReadAccess = (req, res, next) => {
    if (!canReadEntryWithAccess(req.entry, req.journalAccess)) {
        return res.status(404).json({ message: "Entry does not exist" })
    }
    next()
}

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

