const { User } = require("../model/user")
const { validateIds } = require("../validation/common")

// Format only. A malformed uid is 400 "Invalid User ID", and a valid one is rewritten to lowercase in req.params.uid.
// Lowercase keeps the block, friend and chat keys built from it consistent.
// Used alone where the account may be gone, such as chat history.
const userIdFormat = validateIds("uid")

// The user in req.params.uid must exist. Must run after userIdFormat.
const requireUserExists = async (req, res, next) => {
    const targetUser = await User.exists({ _id: req.params.uid }) // lighter than findById
    if (!targetUser) { return res.status(404).json({ message: `User not found!` }) }

    next()
}

module.exports = { userIdFormat, requireUserExists }