const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { Follow } = require("../model/follow")
const { Subscription } = require("../model/subscription")
const { participantKey } = require("../policy/journalAccessPolicy")

const withSession = (query, session) => session ? query.session(session) : query

const loadRelationships = async (userId, authorIds, session) => {
    const keys = [...new Set(authorIds.filter(Boolean).map(id => id.toString()))]
        .filter(authorId => authorId !== userId.toString())
        .map(authorId => participantKey(userId, authorId))

    if (!keys.length) return { blocked: new Set(), friends: new Set() }

    const [blocks, connections] = await Promise.all([
        withSession(BlockList.find({ participants: { $in: keys } }).select("participants"), session).lean(),
        withSession(Connection.find({ participants: { $in: keys }, status: "accepted" }).select("participants"), session).lean()
    ])

    return {
        blocked: new Set(blocks.map(item => item.participants)),
        friends: new Set(connections.map(item => item.participants))
    }
}

const loadSubscribedAuthorIds = async (userId, authorIds, session) => {
    const uniqueIds = [...new Set(authorIds.filter(Boolean).map(id => id.toString()))]
    if (!uniqueIds.length) return new Set()

    const subscriptions = await withSession(
        Subscription.find({ subscriberId: userId, authorId: { $in: uniqueIds } }).select("authorId"),
        session
    ).lean()

    return new Set(subscriptions.map(item => item.authorId.toString()))
}

const blockedUserIds = async (userId, session) => {
    const blocks = await withSession(BlockList.find({
        $or: [{ senderId: userId }, { receiverId: userId }]
    }).select("senderId receiverId"), session).lean()

    return blocks.map(block =>
        block.senderId.equals(userId) ? block.receiverId : block.senderId
    )
}

const loadReaderContextForJournal = async (userId, journal, session) => {
    const [relationships, activeFollow, subscribedAuthorIds] = await Promise.all([
        loadRelationships(userId, [journal.authorId], session),
        withSession(Follow.exists({ followerId: userId, journalId: journal._id, status: "active" }), session),
        loadSubscribedAuthorIds(userId, [journal.authorId], session)
    ])

    return {
        relationships,
        followedIds: new Set(activeFollow ? [journal._id.toString()] : []),
        subscribedAuthorIds
    }
}

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

