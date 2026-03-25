const { User } = require("../model/user")
const mongoose = require('mongoose')

// Validate targetUserId
const userIdValidation = async (req, res, next) => {
    try {
        const targetUserId = req.params.uid

        if (!mongoose.Types.ObjectId.isValid(targetUserId)) { return res.status(404).json({ message: `User not found!` }) }

        const targetUser = await User.exists({ _id: targetUserId }) // lighter than findById

        if (!targetUser) { return res.status(404).json({ message: `User not found!` }) }

        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { userIdValidation }


