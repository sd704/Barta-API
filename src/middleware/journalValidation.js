const mongoose = require("mongoose")
const { VISIBILITIES, JOURNAL_STATUSES, JOURNAL_SORTS, JOURNAL_TITLE_MAX, JOURNAL_ABOUT_MAX, JOURNAL_CATEGORY_MAX, CHAPTER_TITLE_MAX, MAX_CHAPTERS, PROGRESS_MIN, PROGRESS_MAX } = require("../utils/constant")
const { fail, isPlainObject, rejectExtraFields, cleanString, validateBoolean, validateNumber, validateCover, validateIds, parsePagination } = require("../validation/common")

// Fields accepted by Journal POST Body
const CREATE_FIELDS = ["title", "about", "category", "visibility", "status", "cover", "pinned", "order", "progress", "chapters", "commentsAllowed"]

// Fields accepted by Journal PATCH Body
const UPDATE_FIELDS = ["title", "about", "category", "visibility", "status", "cover", "pinned", "order", "progress", "commentsAllowed", "updateChapters"]

// For GET "/api/journals/:jid" and GET "/api/users/:uid/journals"
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
        fail(res, error.message)
    }
}

// For POST/PATCH Journal
// creating=true makes title and category required and accepts chapters array
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

    normalized.cover = validateCover(body.cover)
    validateBoolean(body.pinned, "pinned")
    validateBoolean(body.commentsAllowed, "commentsAllowed")
    validateNumber(body.order, "order", 0, Number.MAX_SAFE_INTEGER)
    validateNumber(body.progress, "progress", PROGRESS_MIN, PROGRESS_MAX)

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

    if (!creating && body.updateChapters !== undefined) {
        if (!Array.isArray(body.updateChapters) || !body.updateChapters.length) {
            throw new Error("updateChapters must be a non-empty array")
        }

        const ids = new Set() // To detect duplicate chapters
        normalized.updateChapters = body.updateChapters.map((chapter, index) => {
            if (!isPlainObject(chapter)) throw new Error(`updateChapters[${index}] must be an object`)
            const extraFields = rejectExtraFields(chapter, ["cid", "title"])
            if (extraFields) throw new Error(extraFields)
            if (!mongoose.Types.ObjectId.isValid(chapter.cid)) throw new Error(`Invalid chapter ID at updateChapters[${index}]`)
            if (ids.has(chapter.cid)) throw new Error("Duplicate chapter ID")
            ids.add(chapter.cid)
            return {
                cid: chapter.cid,
                title: cleanString(chapter.title, "chapter title", { required: true, max: CHAPTER_TITLE_MAX })
            }
        })
    }

    return normalized
}

// For POST "/api/journals"
const validateCreateJournal = (req, res, next) => {
    try {
        req.validatedBody = normalizeJournalBody(req.body, true)
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For PATCH "/api/journals/:jid"
const validateUpdateJournal = (req, res, next) => {
    try {
        req.validatedBody = normalizeJournalBody(req.body, false)
        if (!Object.keys(req.validatedBody).length) return fail(res, "No valid fields supplied")
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For POST/PATCH Journal
const validateChapterBody = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const unknown = rejectExtraFields(req.body, ["title"])
        if (unknown) throw new Error(unknown)

        req.validatedBody = {
            title: cleanString(req.body.title, "title", { required: true, max: CHAPTER_TITLE_MAX })
        }
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

// For PATCH "/api/journals/:jid/chapters/reorder"
const validateChapterReorderBody = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")

        const unknown = rejectExtraFields(req.body, ["chaptersInOrder"])
        if (unknown) throw new Error(unknown)

        const ids = req.body.chaptersInOrder
        if (!Array.isArray(ids) || !ids.length) throw new Error("chaptersInOrder must be a non-empty array")
        if (ids.some(id => !mongoose.Types.ObjectId.isValid(id))) throw new Error("chaptersInOrder contains an invalid ID")
        if (new Set(ids).size !== ids.length) throw new Error("chaptersInOrder contains duplicate IDs")

        req.validatedBody = { chaptersInOrder: ids }
        next()
    } catch (error) {
        fail(res, error.message)
    }
}

module.exports = {
    validateIds,
    validateJournalQuery,
    validateCreateJournal,
    validateUpdateJournal,
    validateChapterBody,
    validateChapterReorderBody
}

