const mongoose = require('mongoose')
// const { COMMENT_TEXT_MAX } = require("../utils/constant")

const commentSchema = new mongoose.Schema({
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "Journal", required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "Entry", default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    isHidden: { type: Boolean, default: false }
}, { timestamps: true })

commentSchema.index({ journalId: 1, entryId: 1, parentId: 1, createdAt: 1 }) // Maintain order, serves both journal and entry

const Comment = mongoose.model('Comment', commentSchema)
module.exports = { Comment }

