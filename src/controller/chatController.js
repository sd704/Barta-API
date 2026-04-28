const { Chat } = require("../model/chat")
const { User } = require("../model/user")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')

// Get messages between 2 users
const getMessages = async (req, res, next) => {
    const userId = req.userObj._id
    const targetUserId = req.params.uid
    const participants = [userId, targetUserId].sort()

    // Check if chat exists, else upsert
    let chat = await Chat.findOne({ participants: participants }).populate({ path: "participants", select: SAFE_DATA }).lean()

    res.status(200).json({ message: `Messages`, data: chat })
}

// Get all users with whom loggedInUser has previously chatted
const getChats = async (req, res, next) => {
    const userId = req.userObj._id

    const chats = await Chat.find(
        { participants: new mongoose.Types.ObjectId(userId) }, // Find chats where loggedInUser is one of the participants
        { participants: 1, messages: { $slice: -1 } } // projection -> choosing which fields are included or excluded in the result.
    ).populate({ path: "participants", select: SAFE_DATA }).lean()

    const filteredChats = chats.filter(chat => (chat.messages.length > 0)).map(chat => {
        const otherUserId = chat.participants.find(user => user._id.toString() !== userId.toString())
        return {
            _id: chat._id,
            userData: otherUserId,
            lastMessage: chat.messages[0]
        }
    })

    res.status(200).json({ message: `Existing Chats`, data: filteredChats })
}

module.exports = { getMessages, getChats }