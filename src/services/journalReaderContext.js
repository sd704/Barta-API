const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { Follow } = require("../model/follow")
const { Subscription } = require("../model/subscription")
const { participantKey } = require("../policy/journalAccessPolicy")

// Load Block and friendship keys for the authors in a list.
// userId — the reader's uid. authorIds — author ids from one or many journals (Duplicates and blanks are allowed).
const loadRelationships = async (userId, authorIds, session) => {

    const keys = [
        ...new Set(authorIds // Removes duplicate IDs. The spread operator converts the Set back into an array.
            .filter(Boolean) // Removes falsy values such as null, undefined, "", and false.
            .map(id => id.toString()) // Converts every ObjectId or other valid ID into a string.
        )
    ]
        .filter(authorId => authorId !== userId.toString()) // Skip the reader; they are not their own friend or block.
        .map(authorId => participantKey(userId, authorId)) // Save participant keys

    if (!keys.length) return { blocked: new Set(), friends: new Set() }

    // One query at a time. Callers inside a transaction share one session, which cannot run queries in parallel.

    // Find Blocklist items with matching keys
    const blocks = await BlockList.find({ participants: { $in: keys } }).select("participants").session(session).lean()

    // Find Connection -> accepted items with matching keys
    const connections = await Connection.find({ participants: { $in: keys }, status: "accepted" }).select("participants").session(session).lean()

    return {
        blocked: new Set(blocks.map(item => item.participants)),
        friends: new Set(connections.map(item => item.participants))
    }
}

// Author ids this reader has paid/subscribed. One id covers every subscribed journal by that author.
const loadSubscribedAuthorIds = async (userId, authorIds, session) => {
    const uniqueIds = [
        ...new Set(authorIds // Removes duplicate IDs. The spread operator converts the Set back into an array.
            .filter(Boolean) // Removes falsy values such as null, undefined, "", and false.
            .map(id => id.toString()) // Converts every ObjectId or other valid ID into a string.
        )
    ]
    if (!uniqueIds.length) return new Set()

    const subscriptions = await Subscription.find({ subscriberId: userId, authorId: { $in: uniqueIds } }).select("authorId").session(session).lean()
    return new Set(subscriptions.map(item => item.authorId.toString()))
}

// The other person in every block involving this user. 
const blockedUserIds = async (userId, session) => {
    const blocks = await BlockList.find({ $or: [{ senderId: userId }, { receiverId: userId }] })
        .select("senderId receiverId")
        .session(session)
        .lean()

    return blocks.map(block => block.senderId.equals(userId) ? block.receiverId : block.senderId)
}

// Everything the policy functions need for one journal: relationships, whether this journal is actively followed, and payment.
// Used by interactionController and commentController
const loadReaderContextForJournal = async (userId, journal, session) => {
    // One query at a time. Comment, like, and save call this inside a transaction.
    const relationships = await loadRelationships(userId, [journal.authorId], session)
    const activeFollow = await Follow.exists({ followerId: userId, journalId: journal._id, status: "active" }).session(session)
    const subscribedAuthorIds = await loadSubscribedAuthorIds(userId, [journal.authorId], session)

    return {
        relationships, // A Set of Blocked and Connected Users
        followedIds: new Set(activeFollow ? [journal._id.toString()] : []), // A Set so policy code can use .has(journalId).
        subscribedAuthorIds // A Set of Author IDs the user has paid for
    }
}

// The four flags resolveJournalAccess stores on the request. Middleware uses this without a session.
const loadAccessFlagsForJournal = async (userId, journal) => {
    const context = await loadReaderContextForJournal(userId, journal)
    const key = participantKey(userId, journal.authorId)

    return {
        isBlocked: context.relationships.blocked.has(key),
        isFriend: context.relationships.friends.has(key),
        isFollower: context.followedIds.has(journal._id.toString()),
        isSubscriber: context.subscribedAuthorIds.has(journal.authorId.toString())
    }
}

module.exports = {
    loadRelationships,
    loadSubscribedAuthorIds,
    blockedUserIds,
    loadReaderContextForJournal,
    loadAccessFlagsForJournal
}

