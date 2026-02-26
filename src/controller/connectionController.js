const { User } = require("../model/user")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')

const receivedRequests = async (req, res, next) => {
    const userId = req.userObj._id
    const userBlockList = req.userBlockList

    const searchResult = await Connection.find({
        senderId: { $nin: userBlockList }, receiverId: userId, status: "interested"
    }).select("senderId").populate("senderId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()

    // There can be a 'null' case, a user send a request, but the user does not exist anymore -> filter
    const responseObj = searchResult.filter(item => item.senderId).map(item => item.senderId)
    return res.status(200).json({ message: `List of connection requests received`, data: responseObj })
}

const sentRequests = async (req, res, next) => {
    const userId = req.userObj._id
    const userBlockList = req.userBlockList

    const searchResult = await Connection.find({
        senderId: userId, receiverId: { $nin: userBlockList }, status: "interested"
    }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
    const responseObj = searchResult.filter(item => item.receiverId).map(item => item.receiverId)
    return res.status(200).json({ message: `List of connection requests sent`, data: responseObj })
}

const existingConnections = async (req, res, next) => {
    const userId = req.userObj._id
    const userBlockList = req.userBlockList

    const searchResult = await Connection.find({
        status: "accepted",
        $or: [{ senderId: userId, receiverId: { $nin: userBlockList } }, { senderId: { $nin: userBlockList }, receiverId: userId }]
    }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
    const responseObj = searchResult.filter(item => item.senderId && item.receiverId).map(item => item.senderId._id.toString() === userId.toString() ? item.receiverId : item.senderId)
    return res.status(200).json({ message: `List of connected users`, data: responseObj })
}

const suggestedUsers = async (req, res, next) => {
    const userId = req.userObj._id
    const userBlockList = req.userBlockList

    const connectionList = await Connection.find({
        $or: [{ senderId: userId }, { receiverId: userId }]
    }).select(["senderId", "receiverId"]).lean()

    const hiddenUsers = new Set()
    connectionList.forEach((item) => {
        hiddenUsers.add(item.senderId.toString())
        hiddenUsers.add(item.receiverId.toString())
    })

    hiddenUsers.add(userId.toString())

    // Search users where ID -> Not In Array
    const searchResult = await User.find({
        _id: { $nin: [...hiddenUsers, ...userBlockList] }
    }).select(SAFE_DATA).skip(req.skip).limit(req.limit).lean()

    return res.status(200).json({ message: `List of connection suggestions`, data: searchResult })
}

const blockedUsers = async (req, res, next) => {
    const userId = req.userObj._id
    const searchResult = await BlockList.find({
        senderId: userId
    }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
    const responseObj = searchResult.filter(item => item.receiverId).map(item => item.receiverId)
    return res.status(200).json({ message: `List of blocked users`, data: responseObj })
}

const getConnectionStatus = async (req, res, next) => {
    const userId = req.userObj._id
    const targetUserId = req.params.id

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) { return res.status(404).json({ message: `User not found!` }) }

    const targetUser = await User.exists({ _id: targetUserId }) // lighter than findById
    if (!targetUser) { return res.status(404).json({ message: `User not found!` }) }

    const participants = [userId.toString(), targetUserId].sort().join('|')

    // Run Parallel
    const [existing, blocked] = await Promise.all([
        Connection.findOne({ participants }).lean(),
        BlockList.findOne({ senderId: userId, receiverId: targetUserId }).lean()
    ])

    const data = existing ? {
        senderId: existing.senderId, receiverId: existing.receiverId, status: existing.status, isBlocked: !!blocked
    } : {
        status: "", isBlocked: !!blocked
    }

    res.status(200).json({ message: `Connection Details`, data })
}

module.exports = { receivedRequests, sentRequests, existingConnections, suggestedUsers, blockedUsers, getConnectionStatus }