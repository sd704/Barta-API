const mongoose = require("mongoose")
const { Journal } = require("../model/journal")
const { Follow } = require("../model/follow")
const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const { Subscription } = require("../model/subscription")
const { httpError } = require("../utils/httpError")
const { paginatedResponse } = require("../utils/apiResponse")
const { PUBLIC_PROFILE_FIELDS } = require("../utils/constant")
const { displayName } = require("../utils/publicProfile")
const { loadRelationships } = require("../services/journalReaderContext")
const { journalDiscoveryError } = require("../policy/journalAccessPolicy")

const followJournal = async (req, res) => {
    const followerId = req.userObj._id
    const journalId = req.journal._id
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findById(journalId).session(session)
            if (!journal) throw httpError(404, "Journal does not exist")

            const relationships = await loadRelationships(followerId, [journal.authorId])
            const discoveryError = journalDiscoveryError(journal, followerId, relationships)
            if (discoveryError) throw httpError(discoveryError.statusCode, discoveryError.message)

            if (journal.visibility === "subscribed") {
                const paid = await Subscription.exists({ subscriberId: followerId, authorId: journal.authorId }).session(session)
                if (!paid) throw httpError(403, `Subscribe to this author to follow "${journal.title}"`)
            }

            // Only public, friends and paid+subscribed journals are followed instantly, everything else needs author's approval
            const status = ["public", "friends", "subscribed"].includes(journal.visibility) ? "active" : "pending"

            await Follow.create([{ followerId, journalId, status }], { session })

            if (status === "active") {
                await Journal.updateOne({ _id: journalId }, { $inc: { followerCount: 1 } }, { session })
            }

            result = { status, title: journal.title }
        })
    } catch (error) {
        if (error.code === 11000) {
            const existing = await Follow.findOne({ followerId, journalId }).lean()
            const title = req.journal.title

            if (existing?.status === "pending") {
                return res.status(409).json({
                    message: `Your request to follow "${title}" is already awaiting approval`,
                    data: { journalId, status: "pending", statusLabel: "Pending approval" }
                })
            }

            return res.status(409).json({
                message: `You are already following "${title}"`,
                data: { journalId, status: "active", statusLabel: "Following" }
            })
        }

        throw error
    } finally {
        await session.endSession()
    }

    const message = result.status === "active"
        ? `You are now following "${result.title}"`
        : `Your request to follow "${result.title}" is awaiting the author's approval`

    res.status(201).json({ message, data: { journalId, status: result.status, statusLabel: result.status === "pending" ? "Pending approval" : "Following" } })
}

const unfollowJournal = async (req, res) => {
    const followerId = req.userObj._id
    const journalId = req.journal._id
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findById(journalId).session(session)
            if (!journal) throw httpError(404, "Journal does not exist")
            if (journal.authorId.equals(followerId)) throw httpError(403, "You cannot unfollow your own journal")

            const deleted = await Follow.findOneAndDelete({ followerId, journalId }, { session })
            if (!deleted) throw httpError(404, "You are not following this journal")

            if (deleted.status === "active") {
                await Journal.updateOne({ _id: journalId, followerCount: { $gt: 0 } }, { $inc: { followerCount: -1 } }, { session })
            }

            const relationships = await loadRelationships(followerId, [journal.authorId])
            const revealTitle = !journalDiscoveryError(journal, followerId, relationships)

            result = { revealTitle, title: journal.title, previousStatus: deleted.status }
        })
    } finally {
        await session.endSession()
    }

    const target = result.revealTitle ? ` "${result.title}"` : ""
    const message = result.previousStatus === "pending"
        ? `Your follow request${target} has been withdrawn`
        : `You unfollowed${target || " the journal"}`.replace("unfollowed the journal", "unfollowed the journal")

    res.status(200).json({ message: result.previousStatus === "pending" ? `Your follow request${target} has been withdrawn` : `You unfollowed${target || " the journal"}` })
}

const getFollowers = async (req, res) => {
    const journal = req.journal

    if (req.journalAccess.mode !== "full") {
        return res.status(200).json({
            message: `Follower profiles for "${journal.title}" are available after access is approved`,
            data: { followerCount: journal.followerCount, followers: null }
        })
    }

    if (!req.journalAccess.isAuthor && req.query.status === "pending") {
        return res.status(403).json({ message: "Only the journal author can review pending follow requests" })
    }

    const { page, limit, skip } = req.pagination
    const query = {
        journalId: journal._id,
        status: req.journalAccess.isAuthor ? (req.query.status || { $in: ["pending", "active"] }) : "active"
    }

    if (!req.journalAccess.isAuthor) {
        const blocks = await BlockList.find({ $or: [{ senderId: req.userObj._id }, { receiverId: req.userObj._id }] }).select("senderId receiverId").lean()

        const blockedIds = blocks.map(block =>
            block.senderId.equals(req.userObj._id) ? block.receiverId : block.senderId
        )

        query.followerId = { $nin: blockedIds }
    }

    const [follows, total, pendingCount] = await Promise.all([
        Follow.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("followerId", PUBLIC_PROFILE_FIELDS).lean(),
        Follow.countDocuments(query),
        req.journalAccess.isAuthor ? Follow.countDocuments({ journalId: journal._id, status: "pending" }) : Promise.resolve(undefined)
    ])

    const data = follows
        .filter(follow => follow.followerId)
        .map(follow => ({ user: follow.followerId, status: follow.status, followedAt: follow.createdAt }))

    res.status(200).json(paginatedResponse(
        `Followers of "${journal.title}"`,
        data,
        total,
        page,
        limit,
        {
            followerCount: journal.followerCount,
            ...(req.journalAccess.isAuthor ? { pendingCount } : {})
        }
    ))
}

const reviewFollower = async (req, res) => {
    const journalId = req.journal._id
    const followerId = req.params.uid
    const decision = req.validatedBody.status

    if (req.userObj._id.equals(followerId)) {
        return res.status(400).json({ message: "You cannot review your own follow request" })
    }

    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findOne({ _id: journalId, authorId: req.userObj._id }).session(session)

            if (!journal) throw httpError(404, "Journal does not exist")

            if (decision === "active") {
                const follower = await User.findById(followerId).select(PUBLIC_PROFILE_FIELDS).session(session)

                if (!follower) {
                    const removed = await Follow.findOneAndDelete({ journalId, followerId }, { session })

                    if (removed?.status === "active") {
                        await Journal.updateOne(
                            { _id: journalId, followerCount: { $gt: 0 } },
                            { $inc: { followerCount: -1 } },
                            { session }
                        )
                    }

                    throw httpError(404, "This user no longer exists, so the follow record was removed")
                }

                const updated = await Follow.findOneAndUpdate(
                    { journalId, followerId, status: "pending" },
                    { $set: { status: "active" } },
                    { new: true, runValidators: true, session }
                )

                if (!updated) {
                    const existing = await Follow.findOne({ journalId, followerId }).session(session)
                    if (existing?.status === "active") {
                        throw httpError(409, `${displayName(follower)} is already an approved follower`)
                    }
                    throw httpError(404, "No follow request exists for this user")
                }

                await Journal.updateOne({ _id: journalId }, { $inc: { followerCount: 1 } }, { session })

                result = { action: "approved", name: displayName(follower), title: journal.title }
                return
            }

            const deleted = await Follow.findOneAndDelete({ journalId, followerId }, { session })

            if (!deleted) throw httpError(404, "No follow request exists for this user")

            if (deleted.status === "active") {
                await Journal.updateOne(
                    { _id: journalId, followerCount: { $gt: 0 } },
                    { $inc: { followerCount: -1 } },
                    { session }
                )
            }

            const follower = await User.findById(followerId).select(PUBLIC_PROFILE_FIELDS).lean()
            result = {
                action: deleted.status === "active" ? "removed" : "rejected",
                name: displayName(follower),
                title: journal.title
            }
        })
    } finally {
        await session.endSession()
    }

    const messages = {
        approved: `${result.name} can now follow "${result.title}"`,
        rejected: `The follow request from ${result.name} was rejected`,
        removed: `${result.name} was removed from the followers of "${result.title}"`
    }

    res.status(200).json({ message: messages[result.action] })
}

module.exports = {
    followJournal,
    unfollowJournal,
    getFollowers,
    reviewFollower
}

