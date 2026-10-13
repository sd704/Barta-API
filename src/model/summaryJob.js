const mongoose = require("mongoose")
// const { SUMMARY_JOB_STATUSES } = require("../utils/constant")

const summaryJobSchema = new mongoose.Schema({
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "Journal", required: true, unique: true },
    status: { type: String, enum: ["pending", "processing", "failed"], default: "pending" },
    version: { type: Number, default: 1, min: 1 },
    attempts: { type: Number, default: 0, min: 0 },
    runAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: "" }
}, {
    timestamps: true
})

summaryJobSchema.index({ status: 1, runAt: 1 })

const SummaryJob = mongoose.model("SummaryJob", summaryJobSchema)

module.exports = { SummaryJob }

