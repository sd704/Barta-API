const pagination = async (req, res, next) => {
    try {
        let page = parseInt(req.query.page) || 1
        page = page < 1 ? 1 : page
        let limit = parseInt(req.query.limit) || 10
        limit = limit > 50 ? 50 : limit
        skip = (page - 1) * limit

        req.page = page
        req.limit = limit
        req.skip = skip
        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { pagination }