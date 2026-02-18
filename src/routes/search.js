const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const express = require('express')
const { tokenAuth } = require("../middleware/tokenAuth")
const { pagination } = require('../middleware/pagination')
const { getBlockList } = require("../middleware/getBlockList")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')
const searchRouter = express.Router()

// Search users using name
// http://localhost:7000/api/search/username/:username?page=1&limit=10
searchRouter.get('/api/search/username/:username', tokenAuth, pagination, getBlockList, async (req, res) => {
    try {
        const { username } = req.params
        const userBlockList = req.userBlockList

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ message: 'Search query "username" required!' })
        }

        const searchText = new RegExp(username.trim(), 'i') // Case-insensitive

        const users = await User.find({
            $and: [{
                // Should not be in Block List
                _id: { $nin: userBlockList }
            }, {
                // Match ANY of these:
                $or: [
                    { firstName: searchText },
                    { lastName: searchText },
                    { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: searchText } } }
                ]
            }]
        }).select(SAFE_DATA).skip(req.skip).limit(req.limit).sort({ firstName: 1 }).lean()

        // $or -> Performs a logical OR operation on an array of one or more expressions and selects documents that satisfy at least one of the expressions.
        // $expr -> Allows the use of expressions within a query predicate.
        // $regexMatch -> Performs a regular expression (regex) pattern matching and returns:

        res.status(200).json({ message: `Search Complete`, data: users })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

// Search user using email
searchRouter.get('/api/search/email/:email', tokenAuth, async (req, res) => {
    try {
        const { email } = req.params
        const result = await User.findOne({ email })
        if (!result) {
            return res.status(404).json({ message: `User with email ${req.body?.email} not found!` })
        }

        // BlockList Check
        const userId = req.userObj._id
        const searchResult = await BlockList.findOne({ senderId: result._id, receiverId: userId }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)
        if (searchResult) {
            return res.status(403).json({ message: `User with email ${req.body?.email} not found!` })
        }

        res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

searchRouter.get('/api/search/id/:id', tokenAuth, async (req, res) => {
    try {
        const { id } = req.params

        // Validate ObjectId format first
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: `Invalid ID!` })
        }

        const result = await User.findById(id)
        if (!result) {
            return res.status(404).json({ message: `Invalid ID!` })
        }

        // BlockList Check
        const userId = req.userObj._id
        const searchResult = await BlockList.findOne({ senderId: result._id, receiverId: userId }).populate("senderId", SAFE_DATA).populate("receiverId", SAFE_DATA)
        if (searchResult) {
            return res.status(403).json({ message: `Invalid ID!` })
        }

        res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
})

module.exports = searchRouter 