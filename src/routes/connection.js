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
            receiverId: userId, status: "interested", senderId: { $nin: userBlockList }
        }).select("senderId").populate("senderId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()

        // There can be a 'null' case, a user send a request, but the user does not exist anymore -> filter
        const responseObj = searchResult.filter(item => item.senderId).map(item => item.senderId)
        return res.status(200).json({ message: `List of connection requests received`, data: responseObj })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// List of sent connection requests
connectionRouter.get('/api/connections/sent', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const searchResult = await Connection.find({
            senderId: userId, status: "interested", receiverId: { $nin: userBlockList }
        }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
        const responseObj = searchResult.filter(item => item.receiverId).map(item => item.receiverId)
        return res.status(200).json({ message: `List of connection requests sent`, data: responseObj })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// List of existing connections
connectionRouter.get('/api/connections/accepted', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const userId = req.userObj._id
        const userBlockList = req.userBlockList

        const searchResult = await Connection.find({
            $or: [{ senderId: userId, receiverId: { $nin: userBlockList }, status: "accepted" }, { senderId: { $nin: userBlockList }, receiverId: userId, status: "accepted" }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
        const responseObj = searchResult.filter(item => item.senderId && item.receiverId).map(item => item.senderId._id.toString() === userId.toString() ? item.receiverId : item.senderId)
        return res.status(200).json({ message: `List of connected users`, data: responseObj })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
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
            _id: { $nin: [...hiddenUsers, ...userBlockList] }
        }).select(SAFE_DATA).skip(req.skip).limit(req.limit).lean()

        return res.status(200).json({ message: `List of connection suggestions`, data: searchResult })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// List of blocked users
connectionRouter.get('/api/connections/blocked', tokenAuth, pagination, async (req, res) => {
    try {
        const userId = req.userObj._id
        const searchResult = await BlockList.find({
            senderId: userId
        }).select("receiverId").populate("receiverId", SAFE_DATA).skip(req.skip).limit(req.limit).lean()
        const responseObj = searchResult.filter(item => item.receiverId).map(item => item.receiverId)
        return res.status(200).json({ message: `List of blocked users`, data: responseObj })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

module.exports = connectionRouter


