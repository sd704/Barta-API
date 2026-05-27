const { Chat } = require("../model/chat")
const { User } = require("../model/user")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')

// Get messages between 2 users
const getMessages = async (req, res, next) => {
    const userId = req.userObj._id
    const targetUserId = req.params.uid
    const participants = [userId, targetUserId].sort()

    // Check if chat exists
    const chat = await Chat.findOne({ participants: participants }).populate({ path: "participants", select: SAFE_DATA }).lean()
    if (chat) {
        return res.status(200).json({ message: `Messages`, data: chat })
    }

    res.status(404).json({ message: `No messages found!` })
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

    // remove empty chats
    const validChats = chats.filter(chat => chat.lastMessage)

    // List of user Ids
    const targetUserIds = validChats.map(chat => chat.participants.find(user => user._id.toString() !== userId.toString())._id)
    const participantKeys = targetUserIds.map(targetId => [userId.toString(), targetId.toString()].sort().join("|"))

    // Connections and Blocks
    const [connections, blocks] = await Promise.all([
        Connection.find({ participants: { $in: participantKeys } }).lean(),
        BlockList.find({ participants: { $in: participantKeys } }).lean()
    ])

    const connectedSet = new Set(connections.map(conn => conn.participants)) // set of participantKeys where connection exists
    const blockedSet = new Set(blocks.map(block => block.participants)) // set of participantKeys where blocked

    const filteredChats = validChats.map(chat => {

        // chat participants is an array
        const otherUser = chat.participants.find(user => user._id.toString() !== userId.toString())
        const otherUserId = otherUser._id.toString()
        const participantKey = [userId.toString(), otherUserId].sort().join("|")

        const isConnected = connectedSet.has(participantKey)
        const connectionDetails = connections.find(obj => obj.participants === participantKey)
        const isBlocked = blockedSet.has(participantKey)
        const blockDetails = blocks.find(obj => obj.participants === participantKey)

        return {
            _id: chat._id,
            userData: otherUser,
            lastMessage: chat.lastMessage,
            unreadCount: chat.unreadCount,
            connectionData: {
                status: isConnected ? (connectionDetails.status) : null,
                senderId: isConnected ? (connectionDetails.senderId) : null,
                blockedByMe: isBlocked ? (blockDetails.senderId.toString() === userId.toString()) : false,
                blockedMe: isBlocked ? (blockDetails.senderId.toString() !== userId.toString()) : false,
            }
        }
    })

    res.status(200).json({ message: `Existing Chats`, data: filteredChats })
}

module.exports = { getMessages, getChats }