const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    isRead: { type: Boolean, default: false }
}, { timestamps: true })


const chatSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true }],
    messages: [messageSchema],
    lastMessage: messageSchema
})

const Chat = mongoose.model('Chat', chatSchema)
module.exports = { Chat }