const mongoose = require('mongoose')
// const { VISIBILITIES, JOURNAL_STATUSES, JOURNAL_TITLE_MAX, JOURNAL_ABOUT_MAX, JOURNAL_CATEGORY_MAX, CHAPTER_TITLE_MAX, PROGRESS_MIN, PROGRESS_MAX } = require("../utils/constant")

const chapterSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, required: true, min: 1 }
}, { timestamps: true })

const journalSchema = new mongoose.Schema({
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    about: { type: String, required: true, trim: true, maxlength: 500 },
    category: { type: String, required: true, trim: true, maxlength: 30 },
    visibility: {
        type: String, lowercase: true, default: "private",
        enum: {
            values: ["public", "private", "friends", "selected", "subscribed"],
            message: `Invalid visibility: {VALUE}`
        }
    },
    status: {
        type: String, lowercase: true, default: "active",
        enum: {
            values: ["active", "paused", "completed", "archived"],
            message: `Invalid status: {VALUE}`
        }
    },
    cover: { type: String, trim: true, default: null },
    pinned: { type: Boolean, default: false },
    order: { type: Number, default: 0 }, // For manual order
    progress: { type: Number, min: 0, max: 100, default: 0 }, // User can mark progress with each entry
    endedAt: { type: Date, default: null }, // When progress touches 100, saves that entry date
    lastEntryAt: { type: Date, default: null },
    chapters: { type: [chapterSchema], default: [] },
    commentsAllowed: { type: Boolean, default: true },
    commentCount: { type: Number, default: 0, min: 0 },
    entryCount: { type: Number, default: 0, min: 0 }, // update this when entry is added, $inc on create and delete.
    milestoneCount: { type: Number, default: 0, min: 0 }, // $inc when an entry of type milestone is created, deleted, or retyped.
    followerCount: { type: Number, default: 0, min: 0 }, // $inc when a follow becomes active
    aiSummary: { type: String, default: "" }, // Cache the generated text
}, {
    timestamps: true,
    optimisticConcurrency: true // prevents one request from silently overwriting changes made by other request.
})

journalSchema.index({ authorId: 1, pinned: -1, lastEntryAt: -1 }) // For feed: Pinned items first, then entry date sort (1 for ascending, -1 for descending)
journalSchema.index({ authorId: 1, status: 1, lastEntryAt: -1 }) // Helps to get document count for specific status: Journal.countDocuments({authorId, status: "active"})
journalSchema.index({ authorId: 1, order: 1 }) // Manual Order, no pins
journalSchema.index({ authorId: 1, createdAt: 1 }) // Date Sort
journalSchema.index({ title: "text", about: "text", category: "text" }) // Helps with Search

// Virtual populate target. authorId stays an ObjectId so access checks can keep calling .equals() and .toString() on it.
// Not stored and not in toJSON. It only exists after .populate("author").
journalSchema.virtual("author", { ref: "User", localField: "authorId", foreignField: "_id", justOne: true })

const Journal = mongoose.model('Journal', journalSchema)
module.exports = { Journal }

