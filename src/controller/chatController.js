const { Chat } = require("../model/chat")
const { User } = require("../model/user")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { visibleChatUser, hiddenChatUser } = require("../utils/publicProfile")
const { CHAT_USER_FIELDS } = require("../utils/constant")
const mongoose = require("mongoose")

const emptyConnection = { status: null, senderId: null, blockedByMe: false }

// Get messages between 2 users. Profiles are not included. A deleted account can still have chats.
const getMessages = async (req, res) => {
    const userId = req.userObj._id.toString()
    const targetUserId = req.params.uid

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(404).json({ message: "User not found!" })
    }

    const participantsKey = [req.userObj._id.toString(), targetUserId].sort().join("|")
    const chat = await Chat.findOne({ participantsKey }).select("messages").lean()

    if (!chat) return res.status(404).json({ message: "No messages found!" })

    res.status(200).json({
        message: "Messages",
        data: { chatId: chat._id, uid: targetUserId, messages: chat.messages }
    })
}

// Get all users with whom loggedInUser has previously chatted
const getChats = async (req, res) => {
    const userId = req.userObj._id

    const chats = await Chat.aggregate([
        { $match: { participants: userId } },
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
                },
                // Taken from the stored ids, so a deleted account still has an id for /messages/:uid.
                peerId: {
                    $arrayElemAt: [
                        { $filter: { input: "$participants", as: "id", cond: { $ne: ["$$id", userId] } } },
                        0
                    ]
                }
            }
        },
        { $project: { unreadCount: 1, lastMessage: 1, peerId: 1 } }
    ])

    // remove empty chats
    const validChats = chats.filter(chat => chat.lastMessage && chat.peerId)

    // List of user Ids
    const peerIds = validChats.map(chat => chat.peerId)
    const participantKeys = peerIds.map(peerId => [userId.toString(), peerId.toString()].sort().join("|"))

    const [users, connections, blocks] = await Promise.all([
        User.find({ _id: { $in: peerIds } }).select(CHAT_USER_FIELDS).lean(),
        Connection.find({ participants: { $in: participantKeys } }).lean(),
        BlockList.find({ participants: { $in: participantKeys } }).lean()
    ])

    const userById = new Map(users.map(user => [user._id.toString(), user]))
    const connectionByKey = new Map(connections.map(connection => [connection.participants, connection]))
    const blockByKey = new Map(blocks.map(block => [block.participants, block]))

    const data = validChats.map(chat => {
        const peerId = chat.peerId
        const participantKey = [userId.toString(), peerId.toString()].sort().join("|")
        const user = userById.get(peerId.toString())
        const connection = connectionByKey.get(participantKey)
        const block = blockByKey.get(participantKey)
        const blockedByThem = Boolean(block && !block.senderId.equals(userId))

        // A missing account and a person who blocked me look the same. Their profile is not sent.
        if (!user || blockedByThem) {
            return {
                _id: chat._id,
                user: hiddenChatUser(peerId),
                lastMessage: chat.lastMessage,
                unreadCount: chat.unreadCount,
                connectionData: emptyConnection
            }
        }

        return {
            _id: chat._id,
            user: visibleChatUser(user),
            lastMessage: chat.lastMessage,
            unreadCount: chat.unreadCount,
            connectionData: {
                status: connection ? connection.status : null,
                senderId: connection ? connection.senderId : null,
                blockedByMe: Boolean(block)
            }
        }
    })

    res.status(200).json({ message: "Existing Chats", data })
}

module.exports = { getMessages, getChats }

