const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { SAFE_DATA } = require("../utils/constant")

// Helper Functions
const getUserAndTarget = (req) => ({ userId: req.userObj._id, targetUserId: req.params.id })
const formatResponse = (doc) => ({ sender: doc.senderId, receiver: doc.receiverId, status: doc.status, createdAt: doc.createdAt })
const formatResponse2 = (doc, status) => ({ sender: doc.senderId, receiver: doc.receiverId, status: status })

// Controllers

const sendConnectRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)
    const participants = [userId.toString(), targetUserId.toString()].sort()

    // Check if connection exists either way
    const existing = await Connection.findOne({ participants, status: { $in: ['accepted', 'interested'] } })

    if (existing) {
        await existing.populate("senderId", SAFE_DATA)
        await existing.populate("receiverId", SAFE_DATA)
        return res.status(409).json({ message: `Connection already exists!`, data: formatResponse(existing) })
    }

    // Upsert is an atomic MongoDB operation that updates a document if it exists or inserts a new document if it doesn’t, 
    // eliminating the need for separate existence checks and preventing race conditions.
    // We let ignored and rejected users to send request again. We update the old connection request (ignored/rejected)
    const connectionObj = await Connection.findOneAndUpdate(
        { participants },
        { $set: { senderId: userId, receiverId: targetUserId, status: 'interested' } },
        { new: true, upsert: true, runValidators: true }
    )

    await connectionObj.populate("senderId", SAFE_DATA)
    await connectionObj.populate("receiverId", SAFE_DATA)
    return res.status(200).json({ message: `Connection request sent successfully!`, data: formatResponse(connectionObj) })
}

const ignoreRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)
    const participants = [userId.toString(), targetUserId.toString()].sort()

    // Check if connection exists either way
    const searchResult = await Connection.findOne({ participants })

    if (searchResult) {
        await searchResult.populate("senderId", SAFE_DATA)
        await searchResult.populate("receiverId", SAFE_DATA)
        return res.status(409).json({ message: `Connection already exists!`, data: formatResponse(searchResult) })
    }

    const connectionObj = { senderId: userId, receiverId: targetUserId, status: 'ignored' }
    const connectionRequest = new Connection(connectionObj)
    const savedObj = await connectionRequest.save()
    await savedObj.populate("senderId", SAFE_DATA)
    await savedObj.populate("receiverId", SAFE_DATA)
    return res.status(200).json({ message: `Connection status set successfully!`, data: formatResponse(savedObj) })
}

const acceptRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)

    // Check if connection request exists, if its "interested", updated to "accepted"
    const updated = await Connection.findOneAndUpdate(
        { senderId: targetUserId, receiverId: userId, status: "interested" },
        { status: "accepted" },
        { runValidators: true, new: true }
    )

    if (updated) {
        await updated.populate("senderId", SAFE_DATA)
        await updated.populate("receiverId", SAFE_DATA)
        return res.status(200).json({ message: `Connection request accepted!`, data: formatResponse(updated) })
    }

    // If not updated, check if it was already accepted
    const existing = await Connection.findOne({ senderId: targetUserId, receiverId: userId, status: "accepted" })

    if (existing) {
        await existing.populate("senderId", SAFE_DATA)
        await existing.populate("receiverId", SAFE_DATA)
        return res.status(409).json({ message: `Connection request already accepted!`, data: formatResponse(existing) })
    }

    return res.status(404).json({ message: `Connection does not exist!` })
}

const rejectRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)

    // Check if connection request exists, if its "interested", updated to "rejected"
    const updated = await Connection.findOneAndUpdate(
        { senderId: targetUserId, receiverId: userId, status: "interested" },
        { status: "rejected" },
        { runValidators: true },
        { new: true }
    )

    if (updated) {
        await updated.populate("senderId", SAFE_DATA)
        await updated.populate("receiverId", SAFE_DATA)
        return res.status(200).json({ message: `Connection request rejected!`, data: formatResponse(updated) })
    }

    return res.status(404).json({ message: `Connection does not exist!` })
}

const withdrawRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)

    const deleted = await Connection.findOneAndDelete({ senderId: userId, receiverId: targetUserId, status: "interested" })

    if (deleted) {
        // Even though the document is deleted from DB, the returned object is still a full Mongoose document in memory. So populate works fine.
        await deleted.populate("senderId", SAFE_DATA)
        await deleted.populate("receiverId", SAFE_DATA)
        return res.status(200).json({ message: `Connection request withdrawn!`, data: formatResponse2(deleted, "withdraw") })
    }

    return res.status(404).json({ message: `Connection does not exist!` })
}

const removeRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)
    const participants = [userId.toString(), targetUserId.toString()].sort()

    const removed = await Connection.findOneAndDelete({ participants, status: "accepted" })

    if (removed) {
        await removed.populate("senderId", SAFE_DATA)
        await removed.populate("receiverId", SAFE_DATA)
        return res.status(200).json({ message: `Connection removed successfully!`, data: formatResponse2(removed, "remove") })
    }

    return res.status(404).json({ message: `Connection does not exists!` })
}

const blockRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)

    // Check if connection request exists
    const searchResult = await BlockList.findOne({ senderId: userId, receiverId: targetUserId })

    if (searchResult) {
        return res.status(409).json({ message: `User already blocked!` })
    }

    const connectionObj = { senderId: userId, receiverId: targetUserId }
    const blockRequest = new BlockList(connectionObj)
    await blockRequest.save()
    return res.status(200).json({ message: `User blocked successfully!` })
}

const unblockRequest = async (req, res, next) => {
    const { userId, targetUserId } = getUserAndTarget(req)

    // Check if connection request exists and delete
    const searchResult = await BlockList.findOneAndDelete({ senderId: userId, receiverId: targetUserId })

    if (searchResult) {
        return res.status(200).json({ message: `User un-blocked successfully!` })
    }

    return res.status(404).json({ message: `User not in blocklist!` })
}

module.exports = { sendConnectRequest, ignoreRequest, acceptRequest, rejectRequest, withdrawRequest, removeRequest, blockRequest, unblockRequest }