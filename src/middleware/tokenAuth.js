const jwt = require('jsonwebtoken');
const JWTKEY = process.env.JWTKEY;
const { User } = require("../model/user")

const tokenAuth = async (req, res, next) => {
    try {
        const { token } = req.cookies
        if (!token) {
            return res.status(401).json({ message: 'Token not provided!' });
        }

        const _id = await jwt.verify(token, JWTKEY)
        if (!_id) {
            return res.status(404).json({ message: `Invalid Token!` })
        }

        const userObj = await User.findById(_id)
        if (!userObj) {
            return res.status(404).json({ message: `Invalid Credential!` })
        }
        req.userObj = userObj // Passing the data with request object
        next()
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
}

module.exports = { tokenAuth }