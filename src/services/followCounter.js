const { Journal } = require("../model/journal")

// Only active follows are counted. timestamps: false so the count does not move the journal's updatedAt.
// A list of ids decrements each journal by 1. $gt: 0 prevents a negative count.

const incrementFollowerCount = (journalId, session, amount = 1) => {
    if (!amount) return Promise.resolve()
    return Journal.updateOne(
        { _id: journalId },
        { $inc: { followerCount: amount } },
        { session, timestamps: false }
    )
}

const decrementFollowerCount = (journalId, session) => {
    const ids = Array.isArray(journalId) ? journalId : [journalId]
    if (!ids.length) return Promise.resolve()
    return Journal.updateMany(
        { _id: { $in: ids }, followerCount: { $gt: 0 } },
        { $inc: { followerCount: -1 } },
        { session, timestamps: false }
    )
}

module.exports = { incrementFollowerCount, decrementFollowerCount }

