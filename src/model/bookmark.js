const mongoose = require('mongoose')

const bookmarkSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "Entry", required: true }
}, { timestamps: true })

bookmarkSchema.index({ userId: 1, entryId: 1 }, { unique: true }) // user can bookmark only once
bookmarkSchema.index({ userId: 1, createdAt: -1 }) // Find all items bookmarked by user, date sorted
bookmarkSchema.index({ entryId: 1 }) // Helps with cleanup on entry deletion

const Bookmark = mongoose.model('Bookmark', bookmarkSchema)
module.exports = { Bookmark }