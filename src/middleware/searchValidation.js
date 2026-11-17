const { normalizeId } = require("../utils/objectId")

// Express 5 parses req.query again on every read, so the checked value is stored on req.searchQuery.

// GET /api/search/username
const validateNameSearch = (req, res, next) => {
    const { username } = req.query
    if (!username || typeof username !== "string") return res.status(400).json({ message: `Search query 'username' required!` })

    req.searchQuery = { username }
    next()
}

// GET /api/search/email
const validateEmailSearch = (req, res, next) => {
    const { email } = req.query
    if (!email || typeof email !== "string") return res.status(400).json({ message: `Search query 'email' required!` })

    req.searchQuery = { email }
    next()
}

// GET /api/search/id. The id is lowercase from here on.
const validateIdSearch = (req, res, next) => {
    if (!req.query.id) return res.status(400).json({ message: `Search query 'id' required!` })

    const id = normalizeId(req.query.id)
    if (!id) return res.status(400).json({ message: `Invalid User ID` })

    req.searchQuery = { id }
    next()
}

module.exports = { validateNameSearch, validateEmailSearch, validateIdSearch }