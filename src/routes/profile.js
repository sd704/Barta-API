const { User } = require("../model/user")
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { filterUserData } = require("../utils/constant")
const JWTKEY = process.env.JWTKEY;
const express = require('express');
const { tokenAuth } = require("../middleware/tokenAuth")
const userRouter = express.Router();

// Search user using email
userRouter.get('/api/user', tokenAuth, async (req, res) => {
    try {
        const { email } = req.body
        const result = await User.findOne({ email })
        if (!result) {
            res.status(404).json({ message: `User with email ${req.body?.email} not found!` })
        } else {
            res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
        }
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Add new user to DB
userRouter.post('/api/user', async (req, res) => {
    try {
        const { firstName, lastName, email, password, age, gender } = req.body
        const passwordHash = await bcrypt.hash(password, 10)
        const userObj = { firstName, lastName, email, password: passwordHash, age, gender }

        // Creating a new instance of User model
        const user = new User(userObj)
        await user.save()

        const token = await user.getJWT()
        res.status(200).cookie("token", token).json({ message: `User data saved successfully`, data: user.filterSafeData() })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Update user
userRouter.patch('/api/user', tokenAuth, async (req, res) => { })

// Delete user
userRouter.delete('/api/user', tokenAuth, async (req, res) => { })

// Search users using name
userRouter.get('/api/search/username/:username', tokenAuth, async (req, res) => { })

module.exports = userRouter 