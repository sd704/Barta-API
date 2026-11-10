const { Entry } = require("../model/entry")

// timestamps: false so a like does not move the entry's updatedAt.
// match is an extra filter, used when some of the entries should be left alone.
// $gt: 0 prevents a negative count.

const incrementLikeCount = (entryId, session) => Entry.updateOne(
    { _id: entryId },
    { $inc: { likeCount: 1 } },
    { session, timestamps: false }
)

const decrementLikeCount = (entryId, session, match = {}) => {
    const ids = Array.isArray(entryId) ? entryId : [entryId]
    if (!ids.length) return Promise.resolve()
    return Entry.updateMany(
        { _id: { $in: ids }, likeCount: { $gt: 0 }, ...match },
        { $inc: { likeCount: -1 } },
        { session, timestamps: false }
    )
}

module.exports = { incrementLikeCount, decrementLikeCount }

