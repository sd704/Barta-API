const { VISIBILITIES, JOURNAL_STATUSES, JOURNAL_TITLE_MAX, JOURNAL_ABOUT_MAX, JOURNAL_CATEGORY_MAX, CHAPTER_TITLE_MAX, MAX_CHAPTERS, PROGRESS_MIN, PROGRESS_MAX } = require("../utils/constant")
const { isPlainObject, rejectExtraFields, cleanString, validateBoolean, validateNumber, validateCover } = require("../validation/common")
const { normalizeChapterList } = require("./journalChapterValidation")

// Fields accepted by Journal POST Body
const CREATE_FIELDS = ["title", "about", "category", "visibility", "status", "cover", "pinned", "order", "progress", "chapters", "commentsAllowed"]

// Fields accepted by Journal PATCH Body
const UPDATE_FIELDS = ["title", "about", "category", "visibility", "status", "cover", "pinned", "order", "progress", "commentsAllowed", "chapters"]

// For POST/PATCH Journal
// creating=true makes title and category required and accepts chapters as an array of titles.
// creating=false accepts chapters as the full list of { cid, title } items in the new order.
const normalizeJournalBody = (body, creating) => {
    if (!isPlainObject(body)) throw new Error("Request body must be an object")

    // Extra Fields not supported
    const unknown = rejectExtraFields(body, creating ? CREATE_FIELDS : UPDATE_FIELDS)
    if (unknown) throw new Error(unknown)

    const normalized = {}
    const title = cleanString(body.title, "title", { required: creating || body.title !== undefined, max: JOURNAL_TITLE_MAX })
    const about = cleanString(body.about, "about", { required: creating || body.about !== undefined, max: JOURNAL_ABOUT_MAX })
    const category = cleanString(body.category, "category", { required: creating || body.category !== undefined, max: JOURNAL_CATEGORY_MAX })

    if (title !== undefined) normalized.title = title
    if (about !== undefined) normalized.about = about
    if (category !== undefined) normalized.category = category
    if (body.visibility !== undefined) {
        if (!VISIBILITIES.includes(body.visibility)) throw new Error("Invalid visibility")
        normalized.visibility = body.visibility
    }
    if (body.status !== undefined) {
        if (!JOURNAL_STATUSES.includes(body.status)) throw new Error("Invalid status")
        normalized.status = body.status
    }
    if (body.cover !== undefined) normalized.cover = validateCover(body.cover)

    validateBoolean(body.pinned, "pinned")
    validateBoolean(body.commentsAllowed, "commentsAllowed")
    validateNumber(body.order, "order", 0, Number.MAX_SAFE_INTEGER)
    validateNumber(body.progress, "progress", PROGRESS_MIN, PROGRESS_MAX)

    // Private with comments on is rejected in the controller: createJournal checks it, updateJournal checks it against the stored visibility too.
    for (const field of ["pinned", "commentsAllowed", "order", "progress"]) {
        if (body[field] !== undefined) {
            normalized[field] = body[field] // Only copy fields that client actually sent
        }
    }

    // Chapters validation
    if (creating && body.chapters !== undefined) {
        if (!Array.isArray(body.chapters) || body.chapters.length > MAX_CHAPTERS) {
            throw new Error(`chapters must be an array containing at most ${MAX_CHAPTERS} titles`)
        }

        normalized.chapters = body.chapters.map((value, index) => ({
            title: cleanString(value, `chapters[${index}]`, { required: true, max: CHAPTER_TITLE_MAX }),
            order: index + 1
        }))
    }

    if (!creating && body.chapters !== undefined) {
        normalized.chapters = normalizeChapterList(body.chapters)
    }

    return normalized
}

// For POST "/api/journals"
const validateCreateJournal = (req, res, next) => {
    try {
        req.validatedBody = normalizeJournalBody(req.body, true)
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// For PATCH "/api/journals/:jid"
const validateUpdateJournal = (req, res, next) => {
    try {
        req.validatedBody = normalizeJournalBody(req.body, false)
        if (!Object.keys(req.validatedBody).length) return res.status(400).json({ message: "No valid fields supplied" })
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

module.exports = {
    validateCreateJournal,
    validateUpdateJournal
}