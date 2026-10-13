const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")

// An entry comment changes entry.commentCount. A journal comment changes journal.commentCount.
// entryId set means the comment belongs to an entry. With no entryId, journalId is the counter to change.
// session is the caller's transaction, so the counter commits only if the comment write commits.

const counterTarget = (entryId, journalId) => entryId
    ? { model: Entry, id: entryId }
    : { model: Journal, id: journalId }

const incrementCommentCount = ({ journalId, entryId }, session) => {
    const { model, id } = counterTarget(entryId, journalId)
    return model.updateOne({ _id: id }, { $inc: { commentCount: 1 } }, { session })
}

const decrementCommentCount = ({ journalId, entryId }, amount, session) => {
    if (!amount) return Promise.resolve()
    const { model, id } = counterTarget(entryId, journalId)
    return model.updateOne(
        { _id: id },
        [{ $set: { commentCount: { $max: [0, { $subtract: ["$commentCount", amount] }] } } }],
        { session }
    )
}

module.exports = { incrementCommentCount, decrementCommentCount }

