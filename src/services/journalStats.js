const { Entry } = require("../model/entry")

// Recounts entryCount, milestoneCount and lastEntryAt on the journal document after entries are deleted. The caller saves the journal.
// One query at a time, because this runs inside a transaction.
const refreshEntryStats = async (journal, session) => {
    const journalId = journal._id
    journal.entryCount = await Entry.countDocuments({ journalId }).session(session)
    journal.milestoneCount = await Entry.countDocuments({ journalId, type: "milestone" }).session(session)

    const latestEntry = await Entry.findOne({ journalId }).sort({ updatedAt: -1 }).select("updatedAt").session(session).lean()
    journal.lastEntryAt = latestEntry?.updatedAt || null
}

module.exports = { refreshEntryStats }

