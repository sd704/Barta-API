const { Journal } = require("../model/journal")

// Only active follows are counted. $gt: 0 prevents a negative count.
const decrementFollowerCount = (journalId, session) => Journal.updateOne(
    { _id: journalId, followerCount: { $gt: 0 } },
    { $inc: { followerCount: -1 } },
    { session }
)

module.exports = { decrementFollowerCount }

