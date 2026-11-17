// Stored counters such as likeCount, bookmarkCount and followerCount.
// timestamps: false so a count change does not move the document's updatedAt.
// decrement takes one id or a list, and lowers each document by 1. $gt: 0 prevents a negative count.
// match is an extra filter, used when some of the documents should be left alone.

const createCounter = (Model, field) => ({
    increment: (id, session, amount = 1) => {
        if (!amount) return Promise.resolve()
        return Model.updateOne(
            { _id: id },
            { $inc: { [field]: amount } },
            { session, timestamps: false }
        )
    },

    decrement: (id, session, match = {}) => {
        const ids = Array.isArray(id) ? id : [id]
        if (!ids.length) return Promise.resolve()
        return Model.updateMany(
            { _id: { $in: ids }, [field]: { $gt: 0 }, ...match },
            { $inc: { [field]: -1 } },
            { session, timestamps: false }
        )
    }
})

module.exports = { createCounter }

