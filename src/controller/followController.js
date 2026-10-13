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

// For POST "/api/journals/:jid/follow"
const followJournal = async (req, res) => {
    const followerId = req.userObj._id
    const journalId = req.journal._id

    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            const journal = await Journal.findById(journalId).session(session)
            if (!journal) throw httpError(404, "Journal does not exist")

            const relationships = await loadRelationships(followerId, [journal.authorId], session)
            const discoveryError = journalDiscoveryError(journal, followerId, relationships) // Checks if Journal Author made this request 
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

        // 11000 is for Duplicate unique key in Mongo DB
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

    res.status(201).json({
        message,
        data: {
            journalId,
            status: result.status,
            statusLabel: result.status === "pending" ? "Pending approval" : "Following"
        }
    })
}

// For DELETE "/api/journals/:jid/follow"
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

            const relationships = await loadRelationships(followerId, [journal.authorId], session)
            const revealTitle = !journalDiscoveryError(journal, followerId, relationships)

            result = { revealTitle, title: journal.title, previousStatus: deleted.status }
        })
    } finally {
        await session.endSession()
    }

    const target = result.revealTitle ? ` "${result.title}"` : ""
    const message = (result.previousStatus === "pending")
        ? `Your follow request${target} has been withdrawn`
        : `You unfollowed${target || " the journal"}`
    res.status(200).json({ message })
}

// For GET "/api/journals/:jid/followers"
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
        const blockedIds = blocks.map(block => block.senderId.equals(req.userObj._id) ? block.receiverId : block.senderId)
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

// PATCH /api/journals/:jid/followers/:uid. Author only.
// status active approves a pending follow. status rejected deletes a pending or active follow.
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

            // Approve Follower
            if (decision === "active") {
                const follower = await User.findById(followerId).select(PUBLIC_PROFILE_FIELDS).session(session)

                // The user document is gone. Remove the orphaned follow and commit that cleanup.
                // A throw here would roll the delete back, so the 404 is sent after the transaction.
                if (!follower) {
                    const removed = await Follow.findOneAndDelete({ journalId, followerId }, { session })

                    if (removed?.status === "active") {
                        await Journal.updateOne(
                            { _id: journalId, followerCount: { $gt: 0 } }, // $gt: 0 prevents a negative count
                            { $inc: { followerCount: -1 } },
                            { session }
                        )
                    }

                    // throw httpError(404, "This user no longer exists, so the follow record was removed")
                    result = { action: "missingUser", removed: Boolean(removed) }
                    return
                }

                const updated = await Follow.findOneAndUpdate(
                    { journalId, followerId, status: "pending" },
                    { $set: { status: "active" } },
                    { new: true, runValidators: true, session }
                )

                // Update Failed
                if (!updated) {
                    // Find out why it did not match: already active, or missing.
                    const existing = await Follow.findOne({ journalId, followerId }).session(session)
                    if (existing?.status === "active") {
                        throw httpError(409, `${displayName(follower)} is already an approved follower`)
                    }
                    throw httpError(404, "No follow request exists for this user")
                }

                await Journal.updateOne({ _id: journalId }, { $inc: { followerCount: 1 } }, { session }) // Count the newly approved follower +1
                result = { action: "approved", name: displayName(follower), title: journal.title }
                return
            }

            // "rejected" is not stored. It deletes the row, whether it was pending or active.
            // A deleted user populates as null, and displayName falls back to "This user".
            const deleted = await Follow.findOneAndDelete({ journalId, followerId }, { session }).populate("followerId", PUBLIC_PROFILE_FIELDS)

            if (!deleted) throw httpError(404, "No follow request exists for this user")

            if (deleted.status === "active") {
                await Journal.updateOne(
                    { _id: journalId, followerCount: { $gt: 0 } }, // $gt: 0 prevents a negative count
                    { $inc: { followerCount: -1 } },
                    { session }
                )
            }

            result = {
                action: deleted.status === "active" ? "removed" : "rejected", // Removing an approved follower is different from declining a request.
                name: displayName(deleted.followerId),
                title: journal.title
            }
        })
    } finally {
        await session.endSession()
    }


    if (result.action === "missingUser") {
        return res.status(404).json({
            message: result.removed
                ? "This user no longer exists, so the follow record was removed"
                : "This user no longer exists"
        })
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

