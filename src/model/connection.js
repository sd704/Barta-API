const mongoose = require('mongoose')

const connectionSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String, lowercase: true, enum: {
            values: ["accepted", "rejected", "interested", "ignored"],
            message: `Invalid request type: {VALUE}`
        },
        required: true
    }
}, {
    timestamps: true
})

// Prevent duplicate same-direction requests
connectionSchema.index({ senderId: 1, receiverId: 1 }, { unique: true })

// This function executes before model.save()
connectionSchema.pre("save", async function () {
    const connectionRequest = this
    if (connectionRequest.senderId.equals(connectionRequest.receiverId)) {
        throw new Error("Sender and Receiver is same!")
    }
})

const Connection = mongoose.model('Connection', connectionSchema)
module.exports = { Connection }