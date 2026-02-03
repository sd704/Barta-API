const mongoose = require('mongoose')

const blockListSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, {
    timestamps: true
})

// This function executes before model.save()
blockListSchema.pre("save", async function () {
    const blockRequest = this
    if (blockRequest.senderId.equals(blockRequest.receiverId)) {
        throw new Error("Sender and Receiver is same!")
    }
})

const BlockList = mongoose.model('BlockList', blockListSchema)
module.exports = { BlockList }