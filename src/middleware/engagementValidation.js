const { normalizeId } = require("../utils/objectId")
const { FOLLOW_STATUSES, FOLLOW_DECISIONS, JOURNAL_STATUSES, ENTRY_TYPES, DEFAULT_LIST_LIMIT, COMMENT_TEXT_MAX } = require("../utils/constant")
const { isPlainObject, rejectExtraFields, cleanString, validateListQuery } = require("../validation/common")

// Check for routes that require no body. E.g.: Like, Follow, Bookmark
const validateNoFields = (req, res, next) => {

    // Allow if there is no body, or body is an object and has no key-value pair
    if (req.body === undefined || (isPlainObject(req.body) && Object.keys(req.body).length === 0)) {
        return next()
    }

    // Body exists but its not an object
    if (!isPlainObject(req.body)) return res.status(400).json({ message: "Request body must be an object" })

    // Body is an object and has key-value pairs
    return res.status(400).json({ message: `Unsupported field(s): ${Object.keys(req.body).join(", ")}` })
}

// GET "/api/library/journals". status is the journal status, not the follow status.
const validateLibraryJournalsQuery = validateListQuery({
    allowed: ["page", "limit", "status"],
    enums: { status: [JOURNAL_STATUSES, "Invalid journal status"] }
})

// GET "/api/library/bookmarks". type is the entry type.
const validateLibraryBookmarksQuery = validateListQuery({
    allowed: ["page", "limit", "type"],
    enums: { type: [ENTRY_TYPES, "Invalid entry type"] }
})

// For Journal follower list. status is the follow status.
const validateFollowerQuery = validateListQuery({
    allowed: ["page", "limit", "status"],
    enums: { status: [FOLLOW_STATUSES, "status must be either pending or active"] }
})

// For setting Follow status, validate the status in req.body
const validateFollowDecision = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, ["status"])
        if (unknown) throw new Error(unknown)
        if (req.body.status === "pending") throw new Error("pending is assigned automatically and cannot be set manually")
        if (!FOLLOW_DECISIONS.includes(req.body.status)) throw new Error("status must be either active or rejected")

        req.validatedBody = { status: req.body.status }
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// For GET/POST "/api/comments"
const commentTarget = (source) => {

    // Exactly one journalId or entryId is required
    const { journalId, entryId } = source
    if (journalId !== undefined && entryId !== undefined) throw new Error("Send journalId or entryId, not both")
    if (journalId === undefined && entryId === undefined) throw new Error("journalId or entryId is required")

    if (journalId !== undefined) {
        const normalizedJournalId = normalizeId(journalId)
        if (!normalizedJournalId) throw new Error("Invalid journalId")
        return { journalId: normalizedJournalId }
    }

    const normalizedEntryId = normalizeId(entryId)
    if (!normalizedEntryId) throw new Error("Invalid entryId")
    return { entryId: normalizedEntryId }
}

// GET /api/comments. The target id is checked before the journal lookup.
const validateCommentListTarget = (req, res, next) => {
    try {
        req.commentTarget = commentTarget(req.query)
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// POST /api/comments. journalId or entryId comes from the body. text is checked after access.
const validateCommentTarget = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        req.commentTarget = commentTarget(req.body)
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// GET /api/comments. Page and limit, and the target id that was already accepted.
const validateCommentListQuery = validateListQuery({
    allowed: ["page", "limit", "journalId", "entryId"],
    defaultLimit: DEFAULT_LIST_LIMIT
})

// Comment body is { text }. allowedFields lists any other field the route accepts, which were checked earlier.
const validateCommentText = allowedFields => (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, allowedFields)
        if (unknown) throw new Error(unknown)

        req.validatedBody = { text: cleanString(req.body.text, "text", { required: true, max: COMMENT_TEXT_MAX }) }
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// POST /api/comments. Body is { text, journalId } or { text, entryId }. The id was already checked.
const validateNewComment = validateCommentText(["text", "journalId", "entryId"])

// POST /api/comments/:commentId/replies
const validateCommentCreate = validateCommentText(["text"])

// PATCH /api/comments/:commentId
const validateCommentUpdate = validateCommentText(["text"])

// Validate req.body for Comment visibility change
const validateCommentHide = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, ["isHidden"])
        if (unknown) throw new Error(unknown)
        if (typeof req.body.isHidden !== "boolean") throw new Error("isHidden must be a boolean")

        req.validatedBody = { isHidden: req.body.isHidden }
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

module.exports = {
    validateNoFields,
    validateLibraryJournalsQuery,
    validateLibraryBookmarksQuery,
    validateFollowerQuery,
    validateFollowDecision,
    validateCommentListTarget,
    validateCommentTarget,
    validateCommentListQuery,
    validateNewComment,
    validateCommentCreate,
    validateCommentUpdate,
    validateCommentHide
}