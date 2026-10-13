// Runs after every router. A request that matched no route ends here.
const notFound = (req, res) => {
    res.status(404).json({ message: `Route not found: ${req.originalUrl}` })
}

// Four arguments are required. Express only treats a middleware as the error handler when err is the first parameter.
// Register this with no path, and after notFound.
const errorHandler = (err, req, res, next) => {
    console.error(`Error: ${err}`)

    // A response was already started, so Express has to close the connection.
    if (res.headersSent) return next(err)

    // express.json: malformed JSON, or a body over the 1mb limit.
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Request body must be valid JSON" })
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large" })
    }

    // httpError from controllers, and other client errors that carry a status. 5xx messages are not sent to the client.
    if (err.statusCode && err.statusCode < 500) {
        return res.status(err.statusCode).json({ message: err.message })
    }

    if (err.name === "ValidationError") {
        return res.status(400).json({ message: Object.values(err.errors).map(item => item.message).join(", ") })
    }

    // A value that cannot be converted to the schema type, such as a malformed id.
    if (err.name === "CastError") {
        return res.status(400).json({ message: `Invalid ${err.path}` })
    }

    // The document was changed or deleted by another request between load and save.
    if (err.name === "VersionError") {
        return res.status(409).json({ message: "This record was modified by another request. Please retry." })
    }
    if (err.name === "DocumentNotFoundError") {
        return res.status(404).json({ message: "This record no longer exists" })
    }

    // withTransaction already retried. Another transaction kept writing the same documents.
    if (err.code === 112 || err.hasErrorLabel?.("TransientTransactionError")) {
        return res.status(409).json({ message: "Another request changed this data at the same time. Please retry." })
    }

    // 11000 is for Duplicate unique key in Mongo DB
    if (err.code === 11000) {
        return res.status(409).json({ message: "A conflicting record already exists" })
    }

    if (["MongoNetworkError", "MongoServerSelectionError", "MongoNetworkTimeoutError"].includes(err.name)) {
        return res.status(503).json({ message: "Database is unavailable. Please retry." })
    }

    res.status(500).json({ message: "Internal server error" })
}

module.exports = { notFound, errorHandler }

