const mongoose = require('mongoose')
const { MESSAGE_TEXT_MAX } = require("../utils/constant")

const messageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: MESSAGE_TEXT_MAX },
    isRead: { type: Boolean, default: false }
}, { timestamps: true })

const chatSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],

    // The two user ids, sorted and joined with "|". The unique index makes sure a pair has exactly one chat.
    participantsKey: { type: String, required: true, unique: true },
    messages: [messageSchema]
})

// For the inbox, which finds every chat a user is in. Not unique, a user has many chats.
chatSchema.index({ participants: 1 })

// This function executes before model.save()
// Will not work for updates, upsert. Those must set participantsKey themselves.
chatSchema.pre("validate", function () {
    this.participantsKey = this.participants.map(id => id.toString()).sort().join("|")
})

const Chat = mongoose.model('Chat', chatSchema)
module.exports = { Chat }