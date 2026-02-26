const { BlockList } = require("../model/blocklist")

const getBlockList = async (req, res, next) => {
    try {
        const userId = req.userObj._id
        const searchResult = await BlockList.find({
            $or: [{ senderId: userId }, { receiverId: userId }]
        }).select("senderId receiverId")
        const userBlockList = searchResult.map(doc => doc.senderId.equals(userId) ? doc.receiverId : doc.senderId)

        // Users who have blocked loggedIn User, and users who are blocked by loggedIn User
        req.userBlockList = userBlockList
        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { getBlockList }






