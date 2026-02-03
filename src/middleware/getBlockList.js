const { BlockList } = require("../model/blocklist")

const getBlockList = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const searchResult = await BlockList.find({ receiverId: userId }).select("senderId")
        const userBlockList = searchResult.map((item) => item.senderId)

        // Users who have blocked lockedIn User
        req.userBlockList = userBlockList
        next()
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
}

module.exports = { getBlockList }






