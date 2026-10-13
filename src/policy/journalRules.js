const { ENTRY_VISIBILITY_BY_JOURNAL } = require("../utils/constant")

const entryVisibilityForJournal = (journalVisibility, requestedVisibility) => {
    const allowed = ENTRY_VISIBILITY_BY_JOURNAL[journalVisibility] || ["private"]
    if (requestedVisibility === undefined) return journalVisibility

    if (!allowed.includes(requestedVisibility)) {
        const error = new Error(`This journal only allows entry visibility: ${allowed.join(", ")}`)
        error.statusCode = 400
        throw error
    }

    return requestedVisibility
}

module.exports = { entryVisibilityForJournal }

