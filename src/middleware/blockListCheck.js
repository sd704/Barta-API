const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const mongoose = require('mongoose')

const blockListCheck = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const { id } = req.params

        // Validate ObjectId format first
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(403).json({ message: `User not found!` })
        }

        // Validate Receiver ID
        const obj = await User.findById(id)
        if (!obj) {
            return res.status(403).json({ message: `User not found!` })
        }

        // Check if User is Blocked
        const searchResult = await BlockList.findOne({ senderId: id, receiverId: userId })
        if (searchResult) {
            return res.status(403).json({ message: `User not found!` })
        }

        // Check if User blocked Receiver
        const searchResult2 = await BlockList.findOne({ senderId: userId, receiverId: id })
        if (searchResult2) {
            return res.status(403).json({ message: `Un-block user to send any request!` })
        }
        next()
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
}

module.exports = { blockListCheck }