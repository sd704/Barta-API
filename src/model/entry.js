const mongoose = require('mongoose')
const { WORDS_PER_MINUTE } = require("../utils/constant")
// VISIBILITIES, ENTRY_TYPES, ENTRY_TITLE_MAX, ENTRY_PREVIEW_MAX, ENTRY_BODY_MAX, ENTRY_MOOD_MAX, TAG_MAX_LENGTH, MAX_TAGS

const entrySchema = new mongoose.Schema({
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "Journal", required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Select chapter or create new chapter in UI
    type: {
        type: String, lowercase: true, required: true,
        enum: {
            values: ["journal", "decision", "milestone", "failure", "lesson", "launch"],
            message: `Invalid entry type: {VALUE}`
        }
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    preview: { type: String, required: true, trim: true, maxlength: 280 },
    body: { type: String, default: "", maxlength: 100000 },
    cover: { type: String, trim: true, default: null },

    readingTime: { type: Number, default: 1, min: 1 }, // Set in a pre("validate") hook from the body: Math.max(1, Math.ceil(wordCount / 200))
    mood: { type: String, trim: true, maxlength: 40, default: "" },
    tags: {
        type: [{ type: String, trim: true, maxlength: 30 }],
        validate: {
            validator: (tags) => tags.length <= 5,
            message: `Tags cannot exceed ${5}`
        }
    },
    visibility: {
        type: String, lowercase: true, default: "private",
        enum: {
            values: ["public", "private", "friends", "selected", "subscribed"],
            message: `Invalid visibility: {VALUE}`
        }
    },
    commentsAllowed: { type: Boolean, default: true },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true })

entrySchema.index({ journalId: 1, chapterId: 1, createdAt: 1 }) // Maintains Order
entrySchema.index({ journalId: 1, createdAt: -1 }) // Date sort descending
entrySchema.index({ tags: 1 }) // Find entries with same tag

entrySchema.pre("validate", function () {
    const words = (this.body || "").trim().split(/\s+/).filter(Boolean).length
    this.readingTime = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
})

const Entry = mongoose.model('Entry', entrySchema)
module.exports = { Entry }

