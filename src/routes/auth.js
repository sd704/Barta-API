const { User } = require("../model/user")
const bcrypt = require('bcrypt')
const express = require('express')
const authRouter = express.Router()

authRouter.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body

        const userObj = await User.findOne({ email })
        if (!userObj) {
            return res.status(404).json({ message: `Invalid Credential!` })
        }

        const isPasswordValid = await bcrypt.compare(password, userObj.password)
        if (!isPasswordValid) {
            return res.status(404).json({ message: `Invalid Credential!` })
        }

        const token = await userObj.getJWT()
        res.status(200).cookie("token", token).json({ message: `Login Successful!`, data: userObj.filterSafeData() })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

authRouter.post('/api/auth/logout', async (req, res) => {
    try {
        res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `Logout Successful!` })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

module.exports = authRouter 