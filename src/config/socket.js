const socket = require('socket.io')
const { Chat } = require('../model/chat')

const initializeSocket = (server) => {
    const io = socket(server, {
        cors: { origin: "http://localhost:5173" }
    })

    io.on("connection", (socket) => {
        // Handle Events

        socket.on("joinRoom", ({ loggedInUserId, targetUserId }) => {
            const roomId = [loggedInUserId, targetUserId].sort().join('|')
            socket.join(roomId)
        })

        socket.on("sendMessage", async ({ loggedInUserId, targetUserId, text }) => {
            try {
                const roomId = [loggedInUserId, targetUserId].sort().join('|')

                // Check if chat exists
                let chat = await Chat.findOne({ participants: { $all: [loggedInUserId, targetUserId] } })

                // Create chat if chat does not exist
                if (!chat) {
                    chat = new Chat({ participants: [loggedInUserId, targetUserId], messages: [] })
                }

                const newMessage = { senderId: loggedInUserId, text }

                // messageSchema
                chat.messages.push(newMessage)

                // Set lastMessage
                chat.lastMessage = newMessage

                // Save msg to DB
                await chat.save()

                // emit -> sending msg to client
                // io.to(roomId).emit("messageReceived", { loggedInUserId, targetUserId, text })
                io.to(roomId).emit("messageReceived", { lastMessage: chat.lastMessage })

            } catch (err) {
                console.error(err)
            }
        })

    })
}

module.exports = {
    initializeSocket
}
