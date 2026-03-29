const { Chat } = require("../model/chat")
const { User } = require("../model/user")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')

const getMessages = async (req, res, next) => {
    const userId = req.userObj._id
    const targetUserId = req.params.uid
    const participants = [userId, targetUserId].sort()

    // Check if chat exists, else upsert
    let chat = await Chat.findOneAndUpdate(
        { participants: participants },
        { $setOnInsert: { participants, messages: [] } },
        { new: true, upsert: true }
    ).populate({ path: "participants", select: SAFE_DATA }).lean()

    res.status(200).json({ message: `Messages`, data: chat })
}

const getChats = async (req, res, next) => {
    const userId = req.userObj._id

    // Check if chat exists
    const chats = await Chat.find(
        { participants: new mongoose.Types.ObjectId(userId) },
        { participants: 1, lastMessage: 1 } // projection -> choosing which fields are included or excluded in the result.
    ).populate({ path: "participants", select: SAFE_DATA }).lean()

    const filteredChats = chats.filter(chat => chat.lastMessage).map(chat => {
        const otherUserId = chat.participants.find(user => user._id.toString() !== userId.toString())

        return {
            _id: chat._id,
            userData: otherUserId,
            lastMessage: chat.lastMessage
        }
    })

    res.status(200).json({ message: `Existing Chats`, data: filteredChats })
}

module.exports = { getMessages, getChats }