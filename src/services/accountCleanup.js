const { Journal } = require("../model/journal")
const { Entry } = require("../model/entry")
const { Comment } = require("../model/comment")
const { Like } = require("../model/like")
const { Bookmark } = require("../model/bookmark")
const { Follow } = require("../model/follow")
const { Subscription } = require("../model/subscription")
const { Chat } = require("../model/chat")
const { User } = require("../model/user")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { decrementCommentCount } = require("./commentCount")

// Removes everything a user owns or did, so nothing is left pointing at a deleted account. Chats stay until last user has valid account.
const deleteAccountData = async (userId, session) => {

    // User Journals
    const own = await Journal.find({ authorId: userId }, "_id", { session }).lean()
    const ownJournalIds = own.map(journal => journal._id)

    // User Entries
    const ownEntries = await Entry.find({ journalId: { $in: ownJournalIds } }, "_id", { session }).lean()
    const ownEntryIds = ownEntries.map(entry => entry._id)

    // Likes given by User
    const likes = await Like.find({ userId }, "entryId", { session }).lean()

    // Update likeCount 
    if (likes.length) {
        await Entry.updateMany(
            { _id: { $in: likes.map(like => like.entryId) }, journalId: { $nin: ownJournalIds }, likeCount: { $gt: 0 } },
            { $inc: { likeCount: -1 } },
            { session, timestamps: false }
        )
    }

    await Like.deleteMany({ userId }, { session }) // Likes given by User
    await Bookmark.deleteMany({ userId }, { session }) // Bookmarks given by User

    const myComments = { userId, journalId: { $nin: ownJournalIds } } // Comments made by User, not on their own journals
    const topLevel = await Comment.find({ ...myComments, parentId: null }, "_id", { session }).lean() // Top level comments made by User

    // Either its User's comment, or the parentID is a User's comment. This will delete all comments.
    const toBeDeleted = { $or: [myComments, { parentId: { $in: topLevel.map(comment => comment._id) } }] }

    // Comment count group by each entry and each journal
    const counters = await Comment.aggregate([
        { $match: toBeDeleted },
        { $group: { _id: { journalId: "$journalId", entryId: "$entryId" }, amount: { $sum: 1 } } }
    ]).session(session)

    await Comment.deleteMany(toBeDeleted, { session })
    for (const { _id, amount } of counters) {
        await decrementCommentCount(_id, amount, session) // Decrement commentCount for each entry and journal
    }

    // Only active follows are counted in followerCount. A pending follow just goes away.
    const follows = await Follow.find({ followerId: userId }, "journalId status", { session }).lean()
    const activeIds = follows.filter(follow => follow.status === "active").map(follow => follow.journalId)

    // Decrement followerCount for active follows
    if (activeIds.length) {
        await Journal.updateMany(
            { _id: { $in: activeIds }, followerCount: { $gt: 0 } },
            { $inc: { followerCount: -1 } },
            { session, timestamps: false }
        )
    }
    await Follow.deleteMany({ followerId: userId }, { session }) // Follows where user is follower

    await Like.deleteMany({ entryId: { $in: ownEntryIds } }, { session }) // Likes on User's entries
    await Bookmark.deleteMany({ entryId: { $in: ownEntryIds } }, { session }) // Bookmarks on User's entries
    await Comment.deleteMany({ journalId: { $in: ownJournalIds } }, { session }) // Comments on User's journals
    await Follow.deleteMany({ journalId: { $in: ownJournalIds } }, { session }) // Follows on User's journals
    await Entry.deleteMany({ journalId: { $in: ownJournalIds } }, { session }) // User's entries
    await Journal.deleteMany({ authorId: userId }, { session }) // User's journals

    await Subscription.deleteMany({ $or: [{ subscriberId: userId }, { authorId: userId }] }, { session }) // Subscriptions where user is subscriber or author
    await Connection.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }, { session }) // Connections where user is sender or receiver
    await BlockList.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }, { session }) // BlockList where user is sender or receiver

    // A chat stays while the other person still has an account, and shows this user as Unknown User.
    // When nobody left in it has an account, nobody can open it again, so it goes.
    const chats = await Chat.find({ participants: userId }, "participants", { session }).lean()
    const peerIds = chats.flatMap(chat => chat.participants.filter(id => !id.equals(userId)))
    const alive = await User.find({ _id: { $in: peerIds } }, "_id", { session }).lean()
    const aliveIds = new Set(alive.map(user => user._id.toString()))

    const deadChatIds = chats
        .filter(chat => !chat.participants.some(id => !id.equals(userId) && aliveIds.has(id.toString())))
        .map(chat => chat._id)
    await Chat.deleteMany({ _id: { $in: deadChatIds } }, { session })

}

module.exports = { deleteAccountData }

