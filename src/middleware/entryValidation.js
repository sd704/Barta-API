const mongoose = require("mongoose")
const { VISIBILITIES, ENTRY_TYPES, CHAPTER_TITLE_MAX, ENTRY_TITLE_MAX, ENTRY_PREVIEW_MAX, ENTRY_BODY_MAX, ENTRY_MOOD_MAX,
    TAG_MAX_LENGTH, MAX_TAGS, PROGRESS_MIN, PROGRESS_MAX, DEFAULT_LIST_LIMIT } = require("../utils/constant")
const { fail, isPlainObject, rejectExtraFields, cleanString, validateBoolean, validateNumber, validateCover, parsePagination } = require("../validation/common")

// Entry POST body, "progress" is saved in Journal
const CREATE_FIELDS = ["chapterId", "newChapter", "type", "title", "preview", "body", "cover", "mood", "tags", "visibility", "commentsAllowed", "progress"]

// Entry PATCH body
const UPDATE_FIELDS = CREATE_FIELDS.filter(field => field !== "progress")

// For GET "/api/journals/:jid/entries"
const validateEntryQuery = (req, res, next) => {
    try {
        const unknown = rejectExtraFields(req.query, ["page", "limit"])
        if (unknown) throw new Error(unknown)
        req.pagination = parsePagination(req.query, { defaultLimit: DEFAULT_LIST_LIMIT })
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For create/update entry
const normalizeEntryBody = (body, creating) => {
    if (!isPlainObject(body)) throw new Error("Request body must be an object")

    // Reject request if extra fields
    const unknown = rejectExtraFields(body, creating ? CREATE_FIELDS : UPDATE_FIELDS)
    if (unknown) throw new Error(unknown)

    const normalized = {}

    // Reject if no Chapter ID
    if (body.chapterId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(body.chapterId)) throw new Error("Invalid chapterId")
        normalized.chapterId = body.chapterId
    }

    // Create new Chapter
    if (body.newChapter !== undefined) {
        normalized.newChapter = cleanString(body.newChapter, "newChapter", { required: true, max: CHAPTER_TITLE_MAX })
    }

    // Chapter required
    if (creating && !normalized.chapterId && !normalized.newChapter) {
        throw new Error("chapterId or newChapter is required")
    }

    // Entry types required
    if (body.type !== undefined) {
        if (!ENTRY_TYPES.includes(body.type)) throw new Error("Invalid entry type")
        normalized.type = body.type
    } else if (creating) {
        throw new Error("type is required")
    }

    const title = cleanString(body.title, "title", { required: creating || body.title !== undefined, max: ENTRY_TITLE_MAX })
    const preview = cleanString(body.preview, "preview", { required: creating || body.preview !== undefined, max: ENTRY_PREVIEW_MAX })
    const entryBody = cleanString(body.body, "body", { max: ENTRY_BODY_MAX })
    const mood = cleanString(body.mood, "mood", { max: ENTRY_MOOD_MAX })

    if (title !== undefined) normalized.title = title
    if (preview !== undefined) normalized.preview = preview
    if (entryBody !== undefined) normalized.body = entryBody
    if (mood !== undefined) normalized.mood = mood
    if (body.cover !== undefined) normalized.cover = validateCover(body.cover)

    if (body.tags !== undefined) {
        // Exceeded max Tags limit
        if (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS) throw new Error(`tags must contain at most ${MAX_TAGS} items`)

        normalized.tags = body.tags.map((tag, index) => cleanString(tag, `tags[${index}]`, { required: true, max: TAG_MAX_LENGTH }))
        const normalizedTags = normalized.tags.map(tag => tag.toLowerCase())

        // Duplicate Tags
        if (new Set(normalizedTags).size !== normalizedTags.length) throw new Error("Duplicate tags are not allowed")
    }

    // Reject request when body has visibility that does not include VISIBILITIES
    if (body.visibility !== undefined) {
        if (!VISIBILITIES.includes(body.visibility)) throw new Error("Invalid visibility")
        normalized.visibility = body.visibility
    }

    validateBoolean(body.commentsAllowed, "commentsAllowed")

    if (body.visibility === "private" && body.commentsAllowed === true) {
        throw new Error("Comments are not allowed when visibility is private")
    }

    if (body.commentsAllowed !== undefined) {
        normalized.commentsAllowed = body.commentsAllowed
    }

    if (creating && body.progress !== undefined) {
        validateNumber(body.progress, "progress", PROGRESS_MIN, PROGRESS_MAX)
        normalized.progress = body.progress
    }

    // Send normalized entry body
    return normalized
}

// For POST "/api/journals/:jid/entries"
const validateCreateEntry = (req, res, next) => {
    try {
        req.validatedBody = normalizeEntryBody(req.body, true)
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For PATCH "/api/journals/:jid/entries/:eid"
const validateUpdateEntry = (req, res, next) => {
    try {
        req.validatedBody = normalizeEntryBody(req.body, false)
        if (!Object.keys(req.validatedBody).length) return fail(res, "No valid fields supplied")
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

module.exports = {
    validateEntryQuery,
    validateCreateEntry,
    validateUpdateEntry
}

