const { User } = require("../model/user")
const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { tokenAuth } = require("../middleware/tokenAuth")
const { pagination } = require('../middleware/pagination')
const { getBlockList } = require("../middleware/getBlockList")
const { SAFE_DATA } = require("../utils/constant")
const express = require('express')
const connectionRouter = express.Router()

// List of received connection requests
connectionRouter.get('/api/connections/interested', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const searchResult = await Connection.find({
            $and: [{ receiverId: userId, status: "interested" }, { senderId: { $nin: userBlockList } }]
        }).select("senderId").populate("senderId", SAFE_DATA).skip(req.skip).limit(req.limit)
        const responseObj = searchResult.map((item) => item.senderId)
        return res.status(200).json({ message: `List of connection requests received`, data: responseObj })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// List of sent connection requests
connectionRouter.get('/api/connections/sent', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const searchResult = await Connection.find({
            $and: [{ senderId: userId, status: "interested" }, { receiverId: { $nin: userBlockList } }]
        }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit)
        const responseObj = searchResult.map((item) => item.receiverId)
        return res.status(200).json({ message: `List of connection requests sent`, data: responseObj })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// List of existing connections
connectionRouter.get('/api/connections/accepted', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const searchResult = await Connection.find({
            $or: [{ senderId: userId, receiverId: { $nin: userBlockList }, status: "accepted" }, { senderId: { $nin: userBlockList }, receiverId: userId, status: "accepted" }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit)
        const responseObj = searchResult.map((item) => (item.senderId._id.toString() === userId.toString()) ? item.receiverId : item.senderId)
        return res.status(200).json({ message: `List of connected users`, data: responseObj })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// List of users who are not connected
connectionRouter.get('/api/connections/feed', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const connectionList = await Connection.find({
            $or: [{ senderId: userId }, { receiverId: userId }]
        }).select(["senderId", "receiverId"])

        const hiddenUsers = new Set()
        connectionList.forEach((item) => {
            hiddenUsers.add(item.senderId)
            hiddenUsers.add(item.receiverId)
        })

        // Search users where ID -> Not In Array
        const searchResult = await User.find({
            $and: [{ _id: { $nin: Array.from(hiddenUsers) } }, { _id: { $nin: userBlockList } }]
        }).select(SAFE_DATA).skip(req.skip).limit(req.limit)

        return res.status(200).json({ message: `List of connection suggestions`, data: searchResult })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// List of blocked users
connectionRouter.get('/api/connections/blocked', tokenAuth, pagination, async (req, res) => {
    try {
        const userId = req.userObj._id
        const searchResult = await BlockList.find({
            senderId: userId
        }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit)
        const responseObj = searchResult.map((item) => item.receiverId)
        return res.status(200).json({ message: `List of blocked users`, data: responseObj })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

module.exports = connectionRouter


