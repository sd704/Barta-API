const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const mongoose = require('mongoose')

const blockListCheck = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const { id } = req.params

        // Validate ObjectId format first
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: `User not found!` })
        }

        // Validate Receiver ID
        // const obj = await User.findById(id)
        const targetUser = await User.exists({ _id: id }) // lighter than findById
        if (!targetUser) {
            return res.status(404).json({ message: `User not found!` })
        }

        // Check if User is Blocked or User blocked Receiver
        const searchResult = await BlockList.findOne({
            $or: [
                { senderId: id, receiverId: userId },
                { senderId: userId, receiverId: id }
            ]
        })

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