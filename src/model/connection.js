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
connectionSchema.index({ participants: 1 }, { unique: true })

// Performance indexes
connectionSchema.index({ senderId: 1, status: 1 })
connectionSchema.index({ receiverId: 1, status: 1 })

// This function executes before model.save()
connectionSchema.pre("validate", function () {

    // Sender and Receiver same user check
    if (this.senderId.equals(this.receiverId)) {
        throw new Error("Sender and Receiver is same!")
    }

    // Normalize + Sort
    const sorted = [this.senderId.toString(), this.receiverId.toString()].sort()
    this.participants = sorted.map(id => new mongoose.Types.ObjectId(id))
})

const Connection = mongoose.model('Connection', connectionSchema)
module.exports = { Connection }