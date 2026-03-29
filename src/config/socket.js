const socket = require('socket.io')
const { Chat } = require('../model/chat')
const { SAFE_DATA } = require("../utils/constant")

const initializeSocket = (server) => {
    const io = socket(server, {
        cors: { origin: "http://localhost:5173" }
    })

    io.on("connection", (socket) => {
        // Handle Events

        socket.on("joinRoom", ({ loggedInUserId }) => {
            socket.join(loggedInUserId)   // join one room only
        })

        socket.on("sendMessage", async ({ loggedInUserId, targetUserId, text }) => {
            try {
                // const roomId = [loggedInUserId, targetUserId].sort().join('|')
                const participants = [loggedInUserId, targetUserId].sort()
                const newMessage = { senderId: loggedInUserId, text }

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

                const targetUserData = chat.participants.find(user => user._id.toString() !== loggedInUserId.toString())
                const loggedInUserData = chat.participants.find(user => user._id.toString() !== targetUserId.toString())

                // emit -> sending msg to client
                io.to(loggedInUserId).emit("messageReceived", { id: chat._id, lastMessage: chat.lastMessage, receiver: targetUserData })
                io.to(targetUserId).emit("messageReceived", { id: chat._id, lastMessage: chat.lastMessage, receiver: loggedInUserData })

            } catch (err) {
                console.error(err)
            }
        })

    })
}

module.exports = {
    initializeSocket
}
