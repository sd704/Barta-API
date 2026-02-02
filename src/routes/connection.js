const { Connection } = require("../model/connection")
const { tokenAuth } = require("../middleware/tokenAuth")
const { SAFE_DATA, CONNECTION_SAFE_DATA } = require("../utils/constant")
const express = require('express');
const connectionRouter = express.Router();

// List of received connection requests
connectionRouter.get('/api/requests', async (req, res) => { })

// List of existing connections
connectionRouter.get('/api/connections', async (req, res) => { })

// List of users who are not connected
connectionRouter.get('/api/requestfeed', async (req, res) => { })

// List of blocked users
connectionRouter.get('/api/blocked', async (req, res) => { })

// Send Request
connectionRouter.post('/api/requests/interested/:id', tokenAuth, async (req, res) => {
    try {
        const status = "interested"
        const userId = req.userObj._id
        const { id } = req.params

        // Check if connection exists either way
        const searchResult = await Connection.findOne({
            $or: [{ senderId: userId, receiverId: id }, { senderId: id, receiverId: userId }]
        }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)

        if (searchResult) {
            if (['accepted', 'interested', 'blocked'].includes(searchResult.status)) {
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
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Ignore User
connectionRouter.post('/api/requests/ignored/:id', tokenAuth, async (req, res) => {
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
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})




module.exports = connectionRouter 