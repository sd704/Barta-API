const { BlockList } = require("../model/blocklist")
const { participantKey } = require("../utils/participantKey")

const blockListCheck = async (req, res, next) => {
    const userId = req.userObj._id
    const { uid } = req.params

    // Receiver ID already checked on the route by userIdFormat and requireUserExists

    // Check if User is Blocked or User blocked Receiver
    const searchResult = await BlockList.findOne({ participants: participantKey(userId, uid) })

    if (searchResult && searchResult.senderId.equals(userId)) {
        return res.status(403).json({ message: `Un-block user to send any request!` })
    } else if (searchResult) {
        return res.status(404).json({ message: `User not found!` })
    }

    next()
}

module.exports = { blockListCheck }