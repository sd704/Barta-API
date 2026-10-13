// Shared list shape for Journal, entry, followers, library, comments
const paginatedResponse = (message, data, total, page, limit, extra = {}) => ({
    message,
    data, // List
    ...extra, // other fields if needed

    // Tells client how to build the next/previous controls without recounting
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
})

module.exports = { paginatedResponse }

