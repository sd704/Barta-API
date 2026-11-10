const cookie = require("cookie")
const jwt = require('jsonwebtoken')
const JWTKEY = process.env.JWTKEY
const mongoose = require('mongoose')
const { User } = require("../model/user")
const socket = require('socket.io')
const { Chat } = require('../model/chat')
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { CHAT_USER_FIELDS, MESSAGE_TEXT_MAX } = require("../utils/constant")
const { visibleChatUser } = require("../utils/publicProfile")
const { participantKey } = require("../utils/participantKey")

// Simple Map of online user IDs and count no. of logged in devices
const onlineUsers = new Map() // [ {uid, count} ]

// Messages and typing share one rule: the other profile exists, the connection is accepted, and neither side blocked.
// Returns the accepted connection, or null when any part fails.
const findChatConnection = async (userId, targetUserId) => {
    if (typeof targetUserId !== "string" || !mongoose.Types.ObjectId.isValid(targetUserId)) return null

    const participants = participantKey(userId, targetUserId)
    const [connection, isBlocked, targetExists] = await Promise.all([
        Connection.findOne({ participants, status: "accepted" }).lean(),
        BlockList.findOne({ participants }).lean(),
        User.exists({ _id: targetUserId })
    ])

    return (connection && !isBlocked && targetExists) ? connection : null
}

const initializeSocket = (server) => {
    const io = socket(server, {
        cors: {
            origin: "http://localhost:5173",
            credentials: true
        }
    })

    // Socket Middleware for token auth
    io.use(async (socket, next) => {
        try {
            const cookies = cookie.parse(socket.handshake.headers.cookie || "")
            const token = cookies.token

            if (!token) {
                console.log("SOCKET_AUTH_ERROR: EMPTY_TOKEN")
                return next(new Error("EMPTY_TOKEN"))
            }

            const { _id } = jwt.verify(token, JWTKEY)
            if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
                console.log("SOCKET_AUTH_ERROR: INVALID_CREDENTIAL")
                return next(new Error("INVALID_CREDENTIAL"))
            }

            const userObj = await User.findById(_id)
            if (!userObj) {
                console.log("SOCKET_AUTH_ERROR: INVALID_CREDENTIAL")
                return next(new Error("INVALID_CREDENTIAL"))
            }
            socket.user = userObj
            next()
        } catch (err) {
            console.log("SOCKET_AUTH_ERROR: INVALID_TOKEN")
            next(new Error("INVALID_TOKEN"))
        }
    })

    io.on("connection", (socket) => {

        const loggedInUserId = socket.user._id.toString()

        socket.on("joinRoom", () => {
            socket.join(loggedInUserId)   // join one room only
            socket.join(`presence:${loggedInUserId}`)

            // User login from first device -> count=1, later devices will show the count
            const count = onlineUsers.get(loggedInUserId) || 0
            onlineUsers.set(loggedInUserId, count + 1)

            io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: true, lastSeen: new Date() })
        })

        socket.on("presence:subscribe", async ({ userIds }) => {

            // We don't let blocked users know online status
            const participantKeys = userIds.map(targetId => participantKey(loggedInUserId, targetId))

            const [cList, bList] = await Promise.all([
                Connection.find({ participants: { $in: participantKeys }, status: "accepted" }).lean(),
                BlockList.find({ participants: { $in: participantKeys } }).lean()
            ])

            const connectedSet = new Set(cList.map(c => c.participants)) // set of participantKeys where accepted
            const blockedSet = new Set(bList.map(block => block.participants)) // set of participantKeys where blocked

            for (const [index, userId] of userIds.entries()) {
                const key = participantKeys[index]

                if (!blockedSet.has(key) && connectedSet.has(key)) {
                    socket.join(`presence:${userId}`)
                    const userLastSeen = await User.findById(userId).select("lastSeen").lean()
                    const count = onlineUsers.get(userId) || 0
                    io.to(`presence:${userId}`).emit("presence:initial", { uid: userId, status: (count > 0), lastSeen: userLastSeen?.lastSeen })
                }
            }
        })

        socket.on("sendMessage", async (payload) => {
            try {
                const { targetUserId, text } = payload ?? {}

                // id and text validation, before any DB lookup uses targetUserId
                if (!mongoose.Types.ObjectId.isValid(targetUserId) || typeof text !== "string" || !text.trim()) {
                    return
                }

                // Only accepted friends can message. A block stops both sides.
                const friendConnection = await findChatConnection(loggedInUserId, targetUserId)
                if (!friendConnection) throw new Error("SOCKET_ERROR: SEND_MESSAGE_DENIED")

                const participants = [loggedInUserId, targetUserId].sort()
                const newMessage = { senderId: loggedInUserId, text: text.slice(0, MESSAGE_TEXT_MAX) }

                // Check if chat exists, if not upsert
                let chat = await Chat.findOneAndUpdate(
                    { participantsKey: participants.join("|") },
                    {
                        $push: { messages: newMessage },
                        $setOnInsert: { participants }
                    },
                    {
                        returnDocument: "after",
                        upsert: true
                    }
                ).populate({ path: "participants", select: CHAT_USER_FIELDS }).lean()

                const targetUserData = visibleChatUser(chat.participants.find(user => !user._id.equals(loggedInUserId)))
                const loggedInUserData = visibleChatUser(chat.participants.find(user => !user._id.equals(targetUserId)))
                const connectionData = { status: friendConnection.status, senderId: friendConnection.senderId, blockedByMe: false }
                const lastMessage = chat.messages[chat.messages.length - 1]

                // emit -> sending msg to all clients in a chat
                io.to(loggedInUserId).emit("messageReceived", { chatId: chat._id, lastMessage, receiver: targetUserData, connectionData })
                io.to(targetUserId).emit("messageReceived", { chatId: chat._id, lastMessage, receiver: loggedInUserData, connectionData })
            } catch (err) {
                console.error(err)
            }
        })

        socket.on("updateMsgSeen", async (payload) => {
            // Only a person in the chat can mark messages, and only the other person's unread messages from the list are marked.
            // The caller always gets the update, because the read state is theirs. The other person only gets it while chatting is allowed.
            try {
                const { stringChatId, stringMessageIds } = payload ?? {}
                const isId = (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
                if (!isId(stringChatId) || !Array.isArray(stringMessageIds) || stringMessageIds.length === 0 || !stringMessageIds.every(isId)) return

                const userId = socket.user._id
                const chatId = new mongoose.Types.ObjectId(stringChatId)
                const messageIds = stringMessageIds.map(id => new mongoose.Types.ObjectId(id))

                // The participant check is the access check. updateOne then skips ids that are not in this chat, are mine, or are already read.
                const chat = await Chat.findOne({ _id: chatId, participants: userId }).select("participants")
                if (!chat) return

                const result = await Chat.updateOne(
                    { _id: chatId, participants: userId },
                    { $set: { "messages.$[msg].isRead": true } },
                    {
                        arrayFilters: [{
                            "msg._id": { $in: messageIds },
                            "msg.senderId": { $ne: userId },
                            "msg.isRead": false
                        }]
                    }
                )

                if (result.modifiedCount === 0) return

                const peerId = chat.participants.find(id => !id.equals(userId))?.toString()

                io.to(loggedInUserId).emit("msgSeenSuccess", { receiverId: peerId, msgReceiverId: loggedInUserId, stringChatId, stringMessageIds })

                if (peerId && await findChatConnection(loggedInUserId, peerId)) {
                    io.to(peerId).emit("msgSeenSuccess", { receiverId: loggedInUserId, msgReceiverId: loggedInUserId, stringChatId, stringMessageIds })
                }
            } catch (err) {
                console.error(err)
            }
        })

        // Typing is only relayed between accepted friends who have not blocked each other. Anything else is ignored.
        socket.on("typing", async (payload) => {
            try {
                const { targetUserId, status } = payload ?? {}

                // status validation
                if (typeof status !== "boolean") return

                // Not a friend
                if (!await findChatConnection(loggedInUserId, targetUserId)) return

                io.to(targetUserId).emit("typing", { userId: loggedInUserId, status })
            } catch (err) {
                console.error(err)
            }
        })

        // socket.emit("errorMessage", {
        //     message: "SEND_MESSAGE_FAILED"
        // })

        socket.on("disconnect", async () => {
            try {
                const count = onlineUsers.get(loggedInUserId)
                if (count === 1) {
                    // save last seen in DB
                    const update = await User.findByIdAndUpdate(loggedInUserId, { lastSeen: new Date() }, { returnDocument: "after" }).lean()
                    onlineUsers.delete(loggedInUserId)
                    io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: false, lastSeen: update?.lastSeen })
                } else {
                    onlineUsers.set(loggedInUserId, count - 1)
                }
            } catch (err) {
                console.log(err)
            }
        })
    })
}

module.exports = {
    initializeSocket
}
