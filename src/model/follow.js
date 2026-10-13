const mongoose = require('mongoose')
// const { FOLLOW_STATUSES } = require("../utils/constant")

const followSchema = new mongoose.Schema({
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "Journal", required: true },
    status: {
        type: String, lowercase: true, required: true, default: "active",
        enum: {
            values: ["pending", "active"], // Don't need rejected, will just delete the record
            message: `Invalid follow status: {VALUE}`
        }
    }
}, { timestamps: true })

followSchema.index({ followerId: 1, journalId: 1 }, { unique: true }) // user can follow only once
followSchema.index({ journalId: 1, status: 1, createdAt: -1 }) // Helps count or find followers
followSchema.index({ followerId: 1, createdAt: -1 }) // List all Journals user follows, date sorted

const Follow = mongoose.model('Follow', followSchema)
module.exports = { Follow }
