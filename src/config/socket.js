const cookie = require("cookie")
const jwt = require('jsonwebtoken')
const JWTKEY = process.env.JWTKEY
const mongoose = require('mongoose')
const { User } = require("../model/user")
const socket = require('socket.io')
const { Chat } = require('../model/chat')
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { SAFE_DATA } = require("../utils/constant")

// Simple Map of online user IDs and count no. of logged in devices
const onlineUsers = new Map() // [ {uid, count} ]

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

            io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: true })
        })

        socket.on("presence:subscribe", ({ userIds }) => {
            for (const userId of userIds) {
                socket.join(`presence:${userId}`)
                const count = onlineUsers.get(userId) || 0
                io.to(`presence:${userId}`).emit("presence:initial", { uid: userId, status: (count > 0) })
            }
        })

        socket.on("sendMessage", async ({ targetUserId, text }) => {
            try {

                // Check if user is friend or blocked
                const connectionId = [loggedInUserId, targetUserId].sort().join('|')
                const [isFriend, isBlocked] = await Promise.all([
                    Connection.findOne({ participants: connectionId }).lean(),
                    BlockList.findOne({ participants: connectionId }).lean()
                ])

                if (!isFriend || !!isBlocked) {
                    throw new Error("SOCKET_ERROR: SEND_MESSAGE_DENIED")
                }

                // id and text validation
                if (!mongoose.Types.ObjectId.isValid(targetUserId) || typeof text !== "string" || !text.trim()) {
                    return
                }

                const participants = [loggedInUserId, targetUserId].sort()
                const newMessage = { senderId: loggedInUserId, text: text.slice(0, 100) }

                // Check if chat exists, if not upsert
                let chat = await Chat.findOneAndUpdate(
                    { participants },
                    {
                        $push: { messages: newMessage },
                        $setOnInsert: { participants }
                    },
                    {
                        new: true,
                        upsert: true
                    }
                ).populate({ path: "participants", select: SAFE_DATA }).lean()

                const targetUserData = chat.participants.find(user => !user._id.equals(loggedInUserId))
                const loggedInUserData = chat.participants.find(user => !user._id.equals(targetUserId))

                // emit -> sending msg to all clients in a chat
                io.to(loggedInUserId).emit("messageReceived", { chatId: chat._id, lastMessage: chat.messages[chat.messages.length - 1], receiver: targetUserData })
                io.to(targetUserId).emit("messageReceived", { chatId: chat._id, lastMessage: chat.messages[chat.messages.length - 1], receiver: loggedInUserData })

            } catch (err) {
                console.error(err)
            }
        })

        socket.on("updateMsgSeen", async ({ stringChatId, stringMessageIds }) => {

            const chatId = new mongoose.Types.ObjectId(stringChatId)
            const messageIds = stringMessageIds.map(id => new mongoose.Types.ObjectId(id))

            const chat = await Chat.findOne({ _id: chatId }).select('participants')
            if (!chat) { return }

            // Updates messages the belongs to chat (chat id), and sender != loggedInUser
            const result = await Chat.updateOne(
                { _id: chatId, "messages._id": { $in: messageIds } },
                { $set: { "messages.$[msg].isRead": true } },
                {
                    arrayFilters: [
                        {
                            "msg.senderId": { $ne: loggedInUserId },
                            "msg._id": { $in: messageIds },
                            "msg.isRead": false
                        },
                    ]
                }
            )

            const success = (result.matchedCount === 1 && result.modifiedCount > 0)
            if (success) {
                const senderId = chat.participants.find(user => !user._id.equals(loggedInUserId))
                io.to(senderId.toString()).emit("msgSeenSuccess", { receiverId: loggedInUserId, msgReceiverId: loggedInUserId, stringChatId, stringMessageIds })
                io.to(loggedInUserId).emit("msgSeenSuccess", { receiverId: senderId.toString(), msgReceiverId: loggedInUserId, stringChatId, stringMessageIds })
            }

            // Updating on server, better to update on mongo db
            // const chat = await Chat.findById(chatId)
            // chat.messages.forEach(msg => { if (msg.senderId.toString() !== loggedInUserId.toString()) { msg.isRead = true } })
            // await chat.save()

            // notify sender
            // socket.to(chat.participants).emit("messagesSeen", { chatId })
        })

        socket.on("typing", ({ targetUserId, status }) => {
            io.to(targetUserId).emit("typing", { userId: loggedInUserId, status })
        })

        // socket.emit("errorMessage", {
        //     message: "SEND_MESSAGE_FAILED"
        // })

        socket.on("disconnect", async () => {
            try {
                const count = onlineUsers.get(loggedInUserId)
                if (count === 1) {
                    onlineUsers.delete(loggedInUserId)
                    io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: false })

                    // save last seen in DB
                    await User.findByIdAndUpdate(loggedInUserId, { lastSeen: new Date() })
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
