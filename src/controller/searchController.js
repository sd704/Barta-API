const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const { SAFE_DATA } = require("../utils/constant")
const mongoose = require('mongoose')

const findUsersByName = async (req, res, next) => {
    const { username } = req.query
    const userBlockList = req.userBlockList

    if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: 'Search query "username" required!' })
    }

    // Prevents regex injection when building search patterns from user input
    // Pattern breakdown: [.*+?^${}()|[\]\\] matches 16 regex specials: . * + ? ^ $ { } ( ) | [ ] \
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const searchText = new RegExp(escapeRegex(username.trim()), 'i') // Case-insensitive

    const users = await User.find({
        $and: [{
            // Should not be in Block List
            _id: { $nin: userBlockList }
        }, {
            // Match ANY of these:
            $or: [{ firstName: searchText }, { lastName: searchText }, { fullName: searchText }]
        }]
    }).select(SAFE_DATA).skip(req.skip).limit(req.limit).sort({ firstName: 1 }).lean()

    res.status(200).json({ message: `Search Complete`, data: users })
}

const findUserByEmail = async (req, res, next) => {
    const { email } = req.query

    if (!email) {
        return res.status(400).json({ message: 'Search query "email" required!' })
    }

    const result = await User.findOne({ email })
    if (!result) {
        return res.status(404).json({ message: `User with email ${email} not found!` })
    }

    // BlockList Check
    const userId = req.userObj._id
    const searchResult = await BlockList.findOne({ senderId: result._id, receiverId: userId })
    if (searchResult) {
        return res.status(403).json({ message: `User with email ${email} not found!` })
    }

    res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
}

const findUserById = async (req, res, next) => {
    const { id } = req.query

    if (!id) {
        return res.status(400).json({ message: 'Search query "id" required!' })
    }

    // Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ message: `User not found!` })
    }

    const result = await User.findById(id)
    if (!result) {
        return res.status(404).json({ message: `User not found!` })
    }

    // BlockList Check
    const userId = req.userObj._id
    const searchResult = await BlockList.findOne({ senderId: result._id, receiverId: userId })
    if (searchResult) {
        return res.status(403).json({ message: `User not found!` })
    }

    res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
}

module.exports = { findUsersByName, findUserByEmail, findUserById }