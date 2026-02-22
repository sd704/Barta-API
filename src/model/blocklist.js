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
    },
    participants: {
        type: [mongoose.Schema.Types.ObjectId],
        validate(value) {
            if (value.length !== 2) {
                throw new Error("Participants must contain exactly 2 users")
            }
        }
    }
}, {
    timestamps: true
})

// Direction is preserved, Uniqueness is enforced, Reverse duplicates impossible
blockListSchema.index({ participants: 1 }, { unique: true })

// Fast directional queries
blockListSchema.index({ senderId: 1, receiverId: 1 })
blockListSchema.index({ receiverId: 1 })

// This function executes before model.save()
blockListSchema.pre("validate", function () {
    if (this.senderId.equals(this.receiverId)) {
        throw new Error("Sender and Receiver is same!")
    }

    // Normalize + Sort
    const sorted = [this.senderId.toString(), this.receiverId.toString()].sort()
    this.participants = sorted.map(id => new mongoose.Types.ObjectId(id))
})

const BlockList = mongoose.model('BlockList', blockListSchema)
module.exports = { BlockList }