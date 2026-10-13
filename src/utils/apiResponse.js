const paginatedResponse = (message, data, total, page, limit, extra = {}) => ({
    message,
    data,
    ...extra,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
})

module.exports = { paginatedResponse }

