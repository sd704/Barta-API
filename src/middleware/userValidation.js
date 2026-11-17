const validator = require("validator")
const { ALLOWED_UPDATES, USER_ABOUT_MAX, USER_DESCRIPTION_MAX, AGE_MIN, GENDERS } = require("../utils/constant")
const { isPlainObject } = require("../validation/common")

const PASSWORD_RULES = { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }
const NAME_FIELDS = ["firstName", "lastName"]
const TEXT_LIMITS = { about: USER_ABOUT_MAX, description: USER_DESCRIPTION_MAX }

// One sent profile field. Returns the cleaned value, or null when the client clears an optional field.
// null on a name is rejected. Names are also required to be non-blank.
const profileValue = (field, value) => {
    const required = NAME_FIELDS.includes(field)

    if (value === null) {
        if (required) throw new Error(`${field} is required`)
        return null
    }

    if (field === "age") {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("age must be a number")
        if (value < AGE_MIN) throw new Error(`age must be at least ${AGE_MIN}`)
        return value
    }

    if (typeof value !== "string") throw new Error(`${field} must be a string`)
    const cleaned = value.trim()

    if (field === "gender") {
        const gender = cleaned.toLowerCase()
        if (!GENDERS.includes(gender)) throw new Error(`Invalid gender: ${gender}`)
        return gender
    }

    if (required && !cleaned) throw new Error(`${field} is required`)

    const max = TEXT_LIMITS[field]
    if (max && cleaned.length > max) throw new Error(`${field} cannot exceed ${max} characters`)
    return cleaned
}

// email and password as non-empty strings. Shared by signup and login.
const readCredentials = body => {
    const { email, password } = isPlainObject(body) ? body : {}
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
        throw new Error("Email and password required")
    }
    return { email, password }
}

// POST /api/users. req.validatedBody is { email, password, ...profile }. A null optional field is left out.
const validateSignup = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")
        const { email, password } = readCredentials(req.body)

        // Checked on the plain password. The schema validator only sees the bcrypt hash, which always passes.
        if (!validator.isStrongPassword(password, PASSWORD_RULES)) {
            throw new Error("Password must be 8+ characters long with uppercase, lowercase, number, and symbol")
        }

        const profile = {}
        for (const field of ALLOWED_UPDATES) {
            if (req.body[field] === undefined) {
                if (NAME_FIELDS.includes(field)) throw new Error(`${field} is required`)
                continue
            }

            const value = profileValue(field, req.body[field])
            if (value !== null) profile[field] = value // null leaves the optional field unset
        }

        req.validatedBody = { ...profile, email, password }
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// PATCH /api/users. req.validatedBody holds the sent profile fields, cleaned. null means clear.
// email, password, and other fields are ignored, the same as before.
const validateProfileUpdate = (req, res, next) => {
    try {
        if (!isPlainObject(req.body)) throw new Error("Request body must be an object")

        const updates = {}
        for (const field of ALLOWED_UPDATES) {
            if (req.body[field] !== undefined) updates[field] = profileValue(field, req.body[field])
        }

        req.validatedBody = updates
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

// POST /api/auth/login. Express 5 leaves req.body undefined when no JSON body was sent.
const validateLogin = (req, res, next) => {
    try {
        req.validatedBody = readCredentials(req.body)
        next()
    } catch (error) {
        return res.status(400).json({ message: error.message })
    }
}

module.exports = { validateSignup, validateProfileUpdate, validateLogin }

