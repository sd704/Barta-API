const { FOLLOW_STATUSES, FOLLOW_DECISIONS, DEFAULT_LIST_LIMIT, COMMENT_TEXT_MAX } = require("../utils/constant")
const { fail, isPlainObject, rejectExtraFields, cleanString, parsePagination } = require("../validation/common")

// Check for routes that require no body. E.g.: Like, Follow, Bookmark
const validateNoFields = (req, res, next) => {

    // Allow if there is no body, or body is an object and has no key-value pair
    if (req.body === undefined || (isPlainObject(req.body) && Object.keys(req.body).length === 0)) {
        return next()
    }

    // Body exists but its not an object
    if (!isPlainObject(req.body)) return fail(res, "Request body must be an object")

    // Body is an object and has key-value pairs
    return fail(res, `Unsupported field(s): ${Object.keys(req.body).join(", ")}`)
}

// Validate queries. Status, Page and Limit are expected queries
const validatePagedQuery = allowedFields => (req, res, next) => {
    try {
        // Don't allow extra query
        const unknown = rejectExtraFields(req.query, allowedFields)
        if (unknown) throw new Error(unknown)

        // Journal status validation
        if (req.query.status !== undefined && !FOLLOW_STATUSES.includes(req.query.status)) {
            throw new Error("status must be either pending or active")
        }

        req.pagination = parsePagination(req.query)
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For "/library/journals" & "/library/bookmarks"
const validateLibraryQuery = validatePagedQuery(["page", "limit"])

// For Journal follower list
const validateFollowerQuery = validatePagedQuery(["page", "limit", "status"])

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
        fail(res, error.message)
    }
}

// Validate queries for Comments
const validateCommentQuery = (req, res, next) => {
    try {
        const unknown = rejectExtraFields(req.query, ["page", "limit"])
        if (unknown) throw new Error(unknown)

        req.pagination = parsePagination(req.query, { defaultLimit: DEFAULT_LIST_LIMIT })
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// Validate Comment request body = { text }
const validateCommentCreate = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, ["text"])
        if (unknown) throw new Error(unknown)
        req.validatedBody = { text: cleanString(req.body.text, "text", { required: true, max: COMMENT_TEXT_MAX }) }
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// Validate req.body for Update Comment
const validateCommentUpdate = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, ["text"])
        if (unknown) throw new Error(unknown)

        req.validatedBody = { text: cleanString(req.body.text, "text", { required: true, max: COMMENT_TEXT_MAX }) }
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

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
        fail(res, error.message)
    }
}

module.exports = {
    validateNoFields,
    validateLibraryQuery,
    validateFollowerQuery,
    validateFollowDecision,
    validateCommentQuery,
    validateCommentCreate,
    validateCommentUpdate,
    validateCommentHide
}

