const mongoose = require('mongoose')

const likeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "Entry", required: true }
}, { timestamps: true })

likeSchema.index({ userId: 1, entryId: 1 }, { unique: true }) // user can like only once
likeSchema.index({ entryId: 1 }) // Count/delete all likes on specific entry

const Like = mongoose.model('Like', likeSchema)
module.exports = { Like }