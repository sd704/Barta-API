const { blockedUserIds } = require("../services/journalReaderContext")

const getBlockList = async (req, res, next) => {
    try {
        // Users who have blocked loggedIn User, and users who are blocked by loggedIn User
        req.userBlockList = await blockedUserIds(req.userObj._id)
        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { getBlockList }

