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

// Simple Set of online user IDs
const onlineUsers = new Set()

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
            onlineUsers.add(loggedInUserId)
            io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: true })
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
                        $set: { lastMessage: newMessage },
                        $setOnInsert: { participants }
                    },
                    {
                        new: true,
                        upsert: true
                    }
                ).populate({ path: "participants", select: SAFE_DATA })

                const targetUserData = chat.participants.find(user => !user._id.equals(loggedInUserId))
                const loggedInUserData = chat.participants.find(user => !user._id.equals(targetUserId))

                // emit -> sending msg to all clients in a chat
                io.to(loggedInUserId).emit("messageReceived", { chatId: chat._id, lastMessage: chat.lastMessage, receiver: targetUserData })
                io.to(targetUserId).emit("messageReceived", { chatId: chat._id, lastMessage: chat.lastMessage, receiver: loggedInUserData })

            } catch (err) {
                console.error(err)
            }
        })

        socket.on("presence:subscribe", ({ userIds }) => {
            for (const userId of userIds) {
                socket.join(`presence:${userId}`)
                if (onlineUsers.has(userId)) {
                    io.to(`presence:${userId}`).emit("presence:initial", { uid: userId, status: true })
                }
            }
        })

        // socket.emit("errorMessage", {
        //     message: "SEND_MESSAGE_FAILED"
        // })

        socket.on("disconnect", () => {
            onlineUsers.delete(loggedInUserId)
            io.to(`presence:${loggedInUserId}`).emit("presence:update", { uid: loggedInUserId, status: false })
        })
    })
}

module.exports = {
    initializeSocket
}
