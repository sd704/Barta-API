const { User } = require("../model/user")
const bcrypt = require('bcrypt')
const express = require('express')
const { tokenAuth } = require("../middleware/tokenAuth")
const { ALLOWED_UPDATES, SAFE_DATA } = require("../utils/constant")
const userRouter = express.Router()

// Return Logged In User data
userRouter.get('/api/user', tokenAuth, async (req, res) => {
    try {
        res.status(200).json({ message: `Loggedin user data`, data: req.userObj.filterSafeData() })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// Add new user to DB/ SignUp
userRouter.post('/api/user', async (req, res) => {
    try {
        const { firstName, lastName, email, password, age, gender } = req.body
        const passwordHash = await bcrypt.hash(password, 10)
        const userObj = { firstName, lastName, email, password: passwordHash, age, gender }

        // Creating a new instance of User model
        const user = new User(userObj)
        const savedUser = await user.save()

        const token = await user.getJWT()
        res.status(200).cookie("token", token).json({ message: `User data saved successfully`, data: savedUser.filterSafeData() })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// Update user
userRouter.patch('/api/user', tokenAuth, async (req, res) => {
    try {
        const updates = ALLOWED_UPDATES.reduce((acc, field) => {
            if (req.body[field] !== undefined && req.body[field] !== req.userObj[field]) acc[field] = req.body[field]
            return acc
        }, {})

        // If no update data
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided to update' })
        }

        // Update user object
        Object.assign(req.userObj, updates)

        // Save user object
        const updatedUserData = await req.userObj.save()
        res.status(200).json({ message: `User data updated successfully`, data: updatedUserData.filterSafeData(), updatedFields: updates })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

// Delete user
userRouter.delete('/api/user', tokenAuth, async (req, res) => {
    try {
        const deletedUser = req.userObj.filterSafeData()
        await req.userObj.deleteOne()
        res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `User deleted successfully`, data: deletedUser })
    } catch (err) {
        console.error(`Error: ${err}`)
        res.status(500).json({ message: `Interval server error!` })
    }
})

module.exports = userRouter 