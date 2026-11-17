// The allowed entry visibilities for each journal visibility live in constant.js so the schema and this check stay aligned.
const { ENTRY_VISIBILITY_BY_JOURNAL } = require("../utils/constant")
const { httpError } = require("../utils/httpError")

// Decides the visibility stored on a new or edited entry.
// Call it inside the entry transaction. A visibility the journal does not allow throws httpError, which rolls that transaction back.
const entryVisibilityForJournal = (journalVisibility, requestedVisibility) => {
    const allowed = ENTRY_VISIBILITY_BY_JOURNAL[journalVisibility] || ["private"] // Unknown journal visibility falls closed to private entries only.
    if (requestedVisibility === undefined) return journalVisibility // Omitting the field means "match the journal visibility"

    if (!allowed.includes(requestedVisibility)) {
        throw httpError(400, `This journal only allows entry visibility: ${allowed.join(", ")}`)
    }

    return requestedVisibility
}

// Private journals and entries cannot accept comments. A true value throws httpError. Private always stores false.
// Any other visibility keeps the value the client sent, including undefined when the field was omitted.
// Call it inside a transaction. Outside one (createJournal), check the private and true case first and send the 400 directly.
const commentsAllowedForVisibility = (visibility, commentsAllowed) => {
    if (visibility !== "private") return commentsAllowed

    if (commentsAllowed === true) throw httpError(400, "Comments are not allowed when visibility is private")

    return false
}

// null means comments are open. The journal is checked before the entry, so a closed journal is the message the client sees.
const commentsClosedMessage = (journal, entry) => {
    if (journal.visibility === "private") return "Comments are not allowed on a private journal"
    if (!journal.commentsAllowed) return `Comments are turned off for '${journal.title}'`
    if (entry && entry.visibility === "private") return "Comments are not allowed on a private entry"
    if (entry && !entry.commentsAllowed) return `Comments are turned off for '${entry.title}'`
    return null
}

module.exports = { entryVisibilityForJournal, commentsAllowedForVisibility, commentsClosedMessage }