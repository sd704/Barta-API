const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")

// The entry and the journal it belongs to. Either document is null when it is missing.
const loadEntryWithJournal = async (entryId) => {
    const entry = await Entry.findById(entryId)
    if (!entry) return { entry: null, journal: null }

    const journal = await Journal.findById(entry.journalId)
    return { entry, journal }
}

module.exports = { loadEntryWithJournal }