const { blockedUserIds } = require("../services/journalReaderContext")

const getBlockList = async (req, res, next) => {
    // Users who have blocked loggedIn User, and users who are blocked by loggedIn User
    req.userBlockList = await blockedUserIds(req.userObj._id)
    next()
}

module.exports = { getBlockList }