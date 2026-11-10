const { normalizeId } = require("../utils/objectId")
const { fail } = require("../validation/common")

// Express 5 parses req.query again on every read, so the checked value is stored on req.searchQuery.

// GET /api/search/username
const validateNameSearch = (req, res, next) => {
    const { username } = req.query
    if (!username || typeof username !== "string") return fail(res, `Search query 'username' required!`)

    req.searchQuery = { username }
    next()
}

// GET /api/search/email
const validateEmailSearch = (req, res, next) => {
    const { email } = req.query
    if (!email || typeof email !== "string") return fail(res, `Search query 'email' required!`)

    req.searchQuery = { email }
    next()
}

// GET /api/search/id. A malformed id looks the same as a missing user. The id is lowercase from here on.
const validateIdSearch = (req, res, next) => {
    if (!req.query.id) return fail(res, `Search query 'id' required!`)

    const id = normalizeId(req.query.id)
    if (!id) return res.status(404).json({ message: `User not found!` })

    req.searchQuery = { id }
    next()
}

module.exports = { validateNameSearch, validateEmailSearch, validateIdSearch }

