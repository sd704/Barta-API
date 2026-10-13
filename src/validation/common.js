const mongoose = require("mongoose")
const { COVER_PATTERN, MAX_COVER_LENGTH, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require("../utils/constant")

// Send respnse 400 with error message
const fail = (res, message) => res.status(400).json({ message })

// JSON object verification
const isPlainObject = value =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype // Filters out things that are typeof "object" but not object

// Error for rejected extra fields
const rejectExtraFields = (object, allowedFields) => {
    const extras = Object.keys(object).filter(key => !allowedFields.includes(key))
    return extras.length ? `Unsupported field(s): ${extras.join(", ")}` : null
}

// String validation
const cleanString = (value, field, { required = false, max } = {}) => {
    if (value === undefined) {
        if (required) throw new Error(`${field} is required`) // Throw error if string is "required" but undefined
        return undefined // Its fine if not "required"
    }

    if (typeof value !== "string") throw new Error(`${field} must be a string`)

    const cleaned = value.trim()
    if (required && !cleaned) throw new Error(`${field} is required`)
    if (max && cleaned.length > max) throw new Error(`${field} cannot exceed ${max} characters`)
    return cleaned
}

const validateBoolean = (value, field) => {
    if (value !== undefined && typeof value !== "boolean") throw new Error(`${field} must be a boolean`)
}

const validateNumber = (value, field, min, max) => {
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
        throw new Error(`${field} must be between ${min} and ${max}`)
    }
}

// Validate Image data
const validateCover = value => {
    if (value === undefined || value === null || value === "") return value
    if (typeof value !== "string") throw new Error("cover must be an image")
    if (value.length > MAX_COVER_LENGTH) throw new Error("cover image is too large") // Image size check
    if (!COVER_PATTERN.test(value.trim())) {
        throw new Error("cover must be a base64-encoded PNG, JPEG, or WebP image") // Image type check
    }
    return value.trim()
}

// We can pass any no. of IDs to this function
// To be used as a middleware, so (req, res, next)
const validateIds = (...idList) => {
    return (req, res, next) => {
        for (const id of idList) {
            // Reject request if any ID fails
            if (!mongoose.Types.ObjectId.isValid(req.params[id])) return fail(res, `Invalid ${id}`)
        }
        next()
    }
}

// Pagination Query validation
const parsePagination = (query, { defaultLimit = DEFAULT_PAGE_LIMIT, maxLimit = MAX_PAGE_LIMIT } = {}) => {
    const page = query.page === undefined ? 1 : Number(query.page)
    const limit = query.limit === undefined ? defaultLimit : Number(query.limit)

    if (!Number.isInteger(page) || page < 1) throw new Error("page must be a positive integer")
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new Error(`limit must be between 1 and ${maxLimit}`)

    return { page, limit, skip: (page - 1) * limit }
}

module.exports = {
    fail,
    isPlainObject,
    rejectExtraFields,
    cleanString,
    validateBoolean,
    validateNumber,
    validateCover,
    validateIds,
    parsePagination
}

