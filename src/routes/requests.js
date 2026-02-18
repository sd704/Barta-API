const { Connection } = require("../model/connection")
const { BlockList } = require("../model/blocklist")
const { tokenAuth } = require("../middleware/tokenAuth")
const { blockListCheck } = require("../middleware/blockListCheck")
const { SAFE_DATA, CONNECTION_SAFE_DATA } = require("../utils/constant")
const express = require('express')
const requestRouter = express.Router()

// Send Connection Request
requestRouter.post('/api/requests/interested/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "interested"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection exists either way
        const searchResult = await Connection.findOne({
            $or: [{ senderId: userId, receiverId: id }, { senderId: id, receiverId: userId }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (searchResult) {
            if (['accepted', 'interested'].includes(searchResult.status)) {
                const response = { sender: searchResult.senderId, receiver: searchResult.receiverId, status: searchResult.status, createdAt: searchResult.createdAt }
                return res.status(403).json({ message: `Connection already exists!`, data: response })
            } else {
                // We let ignored and rejected users to send request again :)
                // We delete the old connection request (ignored/rejected)
                await searchResult.deleteOne()
            }
        }

        const connectionObj = { senderId: userId, receiverId: id, status }
        const connectionRequest = new Connection(connectionObj)
        const savedObj = await connectionRequest.save()
        await savedObj.populate("senderId", SAFE_DATA)
        await savedObj.populate("receiverId", SAFE_DATA)
        const responseData = { sender: savedObj.senderId, receiver: savedObj.receiverId, status: savedObj.status, createdAt: savedObj.createdAt }
        return res.status(200).json({ message: `Connection request sent successfully!`, data: responseData })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Withdraw Connection Request
requestRouter.post('/api/requests/withdraw/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "withdraw"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection request exists
        const searchResult = await Connection.findOne({
            senderId: userId, receiverId: id, status: "interested"
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (!searchResult) {
            return res.status(403).json({ message: `Connection does not exist!` })
        }

        const responseData = { sender: searchResult.senderId, receiver: searchResult.receiverId, status: status }
        await searchResult.deleteOne()
        return res.status(200).json({ message: `Connection request withdrawn!`, data: responseData })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Ignore User
requestRouter.post('/api/requests/ignored/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "ignored"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection exists either way
        const searchResult = await Connection.findOne({
            $or: [{ senderId: userId, receiverId: id }, { senderId: id, receiverId: userId }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (searchResult) {
            const response = { sender: searchResult.senderId, receiver: searchResult.receiverId, status: searchResult.status, createdAt: searchResult.createdAt }
            return res.status(403).json({ message: `Connection already exists!`, data: response })
        }

        const connectionObj = { senderId: userId, receiverId: id, status }
        const connectionRequest = new Connection(connectionObj)
        const savedObj = await connectionRequest.save()
        await savedObj.populate("senderId", SAFE_DATA)
        await savedObj.populate("receiverId", SAFE_DATA)
        const responseData = { sender: savedObj.senderId, receiver: savedObj.receiverId, status: savedObj.status, createdAt: savedObj.createdAt }
        return res.status(200).json({ message: `Connection status set successfully!`, data: responseData })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Accept Connection Request
requestRouter.post('/api/requests/accepted/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "accepted"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection request exists
        const searchResult = await Connection.findOne({
            senderId: id, receiverId: userId
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (searchResult && searchResult.status === "interested") {
            searchResult.status = status
            const savedObj = await searchResult.save()
            await savedObj.populate("senderId", SAFE_DATA)
            await savedObj.populate("receiverId", SAFE_DATA)
            const responseData = { sender: savedObj.senderId, receiver: savedObj.receiverId, status: savedObj.status, createdAt: savedObj.createdAt }
            return res.status(200).json({ message: `Connection request accepted!`, data: responseData })
        } else if (searchResult && searchResult.status === status) {
            const response = { sender: searchResult.senderId, receiver: searchResult.receiverId, status: searchResult.status, createdAt: searchResult.createdAt }
            return res.status(403).json({ message: `Connection request already accepted!`, data: response })
        } else {
            return res.status(403).json({ message: `Connection does not exist!` })
        }
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Reject Connection Request
requestRouter.post('/api/requests/rejected/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "rejected"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection request exists
        const searchResult = await Connection.findOne({
            senderId: id, receiverId: userId, status: "interested"
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (!searchResult) {
            return res.status(403).json({ message: `Connection does not exist!` })
        }

        searchResult.status = status
        const savedObj = await searchResult.save()
        await savedObj.populate("senderId", SAFE_DATA)
        await savedObj.populate("receiverId", SAFE_DATA)
        const responseData = { sender: savedObj.senderId, receiver: savedObj.receiverId, status: savedObj.status, createdAt: savedObj.createdAt }
        return res.status(200).json({ message: `Connection request rejected!`, data: responseData })

    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Remove Connection
requestRouter.post('/api/requests/remove/:id', tokenAuth, blockListCheck, async (req, res) => {
    try {
        const status = "remove"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection exists either way
        const searchResult = await Connection.findOne({
            $or: [{ senderId: userId, receiverId: id, status: "accepted" }, { senderId: id, receiverId: userId, status: "accepted" }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (!searchResult) {
            return res.status(403).json({ message: `Connection does not exists!` })
        }

        const responseData = { sender: searchResult.senderId, receiver: searchResult.receiverId, status: status }
        await searchResult.deleteOne()
        return res.status(200).json({ message: `Connection removed successfully!`, data: responseData })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Block User, Blocked users cannot see the blockers profile/posts, and cannot send requests
requestRouter.post('/api/requests/blocked/:id', tokenAuth, async (req, res) => {
    try {
        // const status = "blocked"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection request exists
        const searchResult = await BlockList.findOne({ senderId: userId, receiverId: id })

        if (searchResult) {
            return res.status(403).json({ message: `User already blocked!` })
        }

        const connectionObj = { senderId: userId, receiverId: id }
        const blockRequest = new BlockList(connectionObj)
        const savedObj = await blockRequest.save()
        return res.status(200).json({ message: `User blocked successfully!` })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Un-Block User
requestRouter.post('/api/requests/unblocked/:id', tokenAuth, async (req, res) => {
    try {
        // const status = "unblocked"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection request exists
        const searchResult = await BlockList.findOne({ senderId: userId, receiverId: id })

        if (searchResult) {
            await searchResult.deleteOne()
            return res.status(200).json({ message: `User un-blocked successfully!` })
        }
        return res.status(403).json({ message: `User not in blocklist!` })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

module.exports = requestRouter 