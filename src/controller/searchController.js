const { User } = require("../model/user")
const { BlockList } = require("../model/blocklist")
const { Connection } = require("../model/connection")
const { SAFE_DATA } = require("../utils/constant")
const { participantKey } = require("../utils/participantKey")
const { blockedUserCard } = require("../utils/publicProfile")

const findUsersByName = async (req, res, next) => {
    const { username } = req.searchQuery
    const userBlockList = req.userBlockList

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
    const { email } = req.searchQuery

    const result = await User.findOne({ email })
    if (!result) {
        return res.status(404).json({ message: `User with email ${email} not found!` })
    }

    // A block in either direction looks the same as a missing email.
    const blocked = await BlockList.exists({ participants: participantKey(req.userObj._id, result._id) })
    if (blocked) {
        return res.status(404).json({ message: `User with email ${email} not found!` })
    }

    res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
}

const findUserById = async (req, res, next) => {
    const userId = req.userObj._id
    const { id } = req.searchQuery

    if (userId.equals(id)) { return res.status(400).json({ message: "Invalid request" }) }

    const result = await User.findById(id)
    if (!result) { return res.status(404).json({ message: `User not found!` }) }

    const participants = participantKey(userId, result._id)

    // Run Parallel
    const [existing, blocked] = await Promise.all([
        Connection.findOne({ participants }).lean(),
        BlockList.findOne({ participants }).lean(),
    ])

    // BlockList Check. A block from them hides the user, a block from me is shown as blockedByMe.
    if (blocked && !blocked.senderId.equals(userId)) { return res.status(404).json({ message: `User not found!` }) }

    const userData = blocked ? blockedUserCard(result) : result.filterSafeData()

    // Attaching connection status
    const data = {
        ...userData,
        connectionData: {
            status: existing ? existing.status : null,
            senderId: existing ? existing.senderId : null,
            blockedByMe: Boolean(blocked)
        }
    }

    res.status(200).json({ message: `User found successfully`, data })
}

module.exports = { findUsersByName, findUserByEmail, findUserById }