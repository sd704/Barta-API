const { User } = require("../model/user")
const { normalizeId } = require("../utils/objectId")

// Format only. A malformed uid is 404, the same as a missing user, and a valid one is rewritten to lowercase in req.params.uid.
// Lowercase keeps the block, friend and chat keys built from it consistent.
const userIdFormat = (req, res, next) => {
    const targetUserId = normalizeId(req.params.uid)
    if (!targetUserId) { return res.status(404).json({ message: `User not found!` }) }

    req.params.uid = targetUserId
    next()
}

// The user in req.params.uid must exist. Must run after userIdFormat or validateIds("uid").
const requireUserExists = async (req, res, next) => {
    try {
        const targetUser = await User.exists({ _id: req.params.uid }) // lighter than findById
        if (!targetUser) { return res.status(404).json({ message: `User not found!` }) }

        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { userIdFormat, requireUserExists }