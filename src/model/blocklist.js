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

blockListSchema.index(
    { senderId: 1, receiverId: 1 },
    { unique: true }
)

// This function executes before model.save()
blockListSchema.pre("validate", async function () {
    if (this.senderId.equals(this.receiverId)) {
        throw new Error("Sender and Receiver is same!")
    }
})

const BlockList = mongoose.model('BlockList', blockListSchema)
module.exports = { BlockList }