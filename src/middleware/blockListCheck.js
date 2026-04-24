const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const mongoose = require('mongoose')

const blockListCheck = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const { uid } = req.params

        // Validate Receiver ID already done by middleware -> userIdValidation 

        const participants = [userId.toString(), uid].sort().join('|')

        // Check if User is Blocked or User blocked Receiver
        const searchResult = await BlockList.findOne({ participants })

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