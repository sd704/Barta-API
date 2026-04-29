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

    const chats = await Chat.aggregate([
        {
            $match: { participants: userId }
        },
        {
            $addFields: {
                lastMessage: { $arrayElemAt: ["$messages", -1] },
                unreadCount: {
                    $size: {
                        $filter: {
                            input: "$messages",
                            as: "message",
                            cond: { $and: [{ $ne: ["$$message.senderId", userId] }, { $eq: ["$$message.isRead", false] }] }
                        }
                    }
                }
            }
        },
        {
            $lookup: { from: "users", localField: "participants", foreignField: "_id", as: "participants" }
        },
        {
            $project: {
                unreadCount: 1,
                lastMessage: 1,
                participants: {
                    $map: {
                        input: "$participants",
                        as: "participant",
                        in: {
                            _id: "$$participant._id", firstName: "$$participant.firstName", lastName: "$$participant.lastName", email: "$$participant.email",
                            about: "$$participant.about", description: "$$participant.description", age: "$$participant.age", gender: "$$participant.gender", pfp: "$$participant.pfp"
                        }
                    }
                }
            }
        }
    ])

    // const chats = await Chat.find(
    //     { participants: new mongoose.Types.ObjectId(userId) }, // Find chats where loggedInUser is one of the participants
    //     { participants: 1, messages: { $slice: -1 } } // projection -> choosing which fields are included or excluded in the result.
    // ).populate({ path: "participants", select: SAFE_DATA }).lean()

    const filteredChats = chats.filter(chat => chat.lastMessage).map(chat => {
        const otherUserId = chat.participants.find(user => user._id.toString() !== userId.toString())
        return {
            _id: chat._id,
            userData: otherUserId,
            lastMessage: chat.lastMessage,
            unreadCount: chat.unreadCount
        }
    })

    res.status(200).json({ message: `Existing Chats`, data: filteredChats })
}

module.exports = { getMessages, getChats }