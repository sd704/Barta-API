const pagination = (req, res, next) => {
    let page = parseInt(req.query.page) || 1
    page = page < 1 ? 1 : page
    let limit = parseInt(req.query.limit) || 10

    limit = Math.min(Math.max(limit, 1), 50) // A negative limit safety
    const skip = (page - 1) * limit

    req.page = page
    req.limit = limit
    req.skip = skip
    next()
}

module.exports = { pagination }