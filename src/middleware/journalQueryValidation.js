const { JOURNAL_SORTS, JOURNAL_STATUSES } = require("../utils/constant")
const { rejectExtraFields, parsePagination } = require("../validation/common")

// For GET "/api/journals" and GET "/api/users/:uid/journals"
const validateJournalQuery = (req, res, next) => {
    try {
        // Extra Fields not supported
        const unknown = rejectExtraFields(req.query, ["status", "page", "limit", "sort"])
        if (unknown) throw new Error(unknown)

        // Default is "pinned" first, then "most recently updated"
        const sort = req.query.sort || "updated"
        if (!JOURNAL_SORTS.includes(sort)) throw new Error("Invalid sort value")

        // Journal "status" validation
        if (req.query.status && !JOURNAL_STATUSES.includes(req.query.status)) throw new Error("Invalid journal status")

        req.pagination = parsePagination(req.query)
        req.journalSort = sort
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

module.exports = { validateJournalQuery }