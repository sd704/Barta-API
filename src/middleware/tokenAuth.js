const jwt = require('jsonwebtoken')
const JWTKEY = process.env.JWTKEY
const { User } = require("../model/user")
const mongoose = require('mongoose')

const tokenAuth = async (req, res, next) => {
    try {
        const { token } = req.cookies
        if (!token) {
            return res.status(401).json({ message: 'Token not provided!' });
        }

        const { _id } = await jwt.verify(token, JWTKEY)
        if (!_id) {
            return res.status(404).json({ message: `Invalid Token!` })
        }

        // Validate ObjectId format first
        if (!mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(404).json({ message: `Invalid Credential!` })
        }

        const userObj = await User.findById(_id)
        if (!userObj) {
            return res.status(404).json({ message: `Invalid Credential!` })
        }
        req.userObj = userObj // Passing the data with request object
        next()
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Internal server error!` })
    }
}

module.exports = { tokenAuth }