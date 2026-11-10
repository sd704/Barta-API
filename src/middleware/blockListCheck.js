const { BlockList } = require("../model/blocklist")
const { participantKey } = require("../utils/participantKey")

const blockListCheck = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const { uid } = req.params

        // Validate Receiver ID already done by middleware -> userIdValidation

        // Check if User is Blocked or User blocked Receiver
        const searchResult = await BlockList.findOne({ participants: participantKey(userId, uid) })

        if (searchResult && searchResult.senderId.equals(userId)) {
            return res.status(403).json({ message: `Un-block user to send any request!` })
        } else if (searchResult) {
            return res.status(404).json({ message: `User not found!` })
        }

        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { blockListCheck }
