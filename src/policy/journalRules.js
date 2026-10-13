// The allowed entry visibilities for each journal visibility live in constant.js so the schema and this check stay aligned.
const { ENTRY_VISIBILITY_BY_JOURNAL } = require("../utils/constant")

// Decides the visibility stored on a new or edited entry.
// Used by entryController
const entryVisibilityForJournal = (journalVisibility, requestedVisibility) => {
    const allowed = ENTRY_VISIBILITY_BY_JOURNAL[journalVisibility] || ["private"] // Unknown journal visibility falls closed to private entries only.
    if (requestedVisibility === undefined) return journalVisibility // Omitting the field means "match the journal visibility"

    if (!allowed.includes(requestedVisibility)) {
        const error = new Error(`This journal only allows entry visibility: ${allowed.join(", ")}`)
        error.statusCode = 400
        throw error
    }

    return requestedVisibility
}

// Private journals and entries cannot accept comments. A true value is rejected. Private always stores false.
// Any other visibility keeps the value the client sent, including undefined when the field was omitted.
const commentsAllowedForVisibility = (visibility, commentsAllowed) => {
    if (visibility !== "private") return commentsAllowed

    if (commentsAllowed === true) {
        const error = new Error("Comments are not allowed when visibility is private")
        error.statusCode = 400
        throw error
    }

    return false
}

module.exports = { entryVisibilityForJournal, commentsAllowedForVisibility }

