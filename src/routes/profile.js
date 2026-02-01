const { User } = require("../model/user")
const bcrypt = require('bcrypt');
const express = require('express');
const { tokenAuth } = require("../middleware/tokenAuth")
const { ALLOWED_UPDATES, SAFE_DATA } = require("../utils/constant")
const userRouter = express.Router();

// Search user using email
userRouter.get('/api/user', tokenAuth, async (req, res) => {
    try {
        const { email } = req.body
        const result = await User.findOne({ email })
        if (!result) {
            return res.status(404).json({ message: `User with email ${req.body?.email} not found!` })
        }
        res.status(200).json({ message: `User found successfully`, data: result.filterSafeData() })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
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
        await user.save()

        const token = await user.getJWT()
        res.status(200).cookie("token", token).json({ message: `User data saved successfully`, data: user.filterSafeData() })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Update user
userRouter.patch('/api/user', tokenAuth, async (req, res) => {
    try {
        const updates = ALLOWED_UPDATES.reduce((acc, field) => {
            if (req.body[field] !== undefined && req.body[field] !== req.userObj[field]) acc[field] = req.body[field];
            return acc;
        }, {})

        // If no update data
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided to update' });
        }

        // Update user object
        Object.assign(req.userObj, updates);

        // Save user object
        const updatedUserData = await req.userObj.save()
        res.status(200).json({ message: `User data updated successfully`, data: updatedUserData.filterSafeData(), updatedFields: updates })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Delete user
userRouter.delete('/api/user', tokenAuth, async (req, res) => {
    try {
        const deletedUser = req.userObj.filterSafeData()
        await req.userObj.deleteOne()
        res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `User deleted successfully`, data: deletedUser })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

// Search users using name
// http://localhost:7000/api/search/username/:username?page=1&limit=10
userRouter.get('/api/search/username/:username', tokenAuth, async (req, res) => {
    try {
        const { username } = req.params

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ message: 'Search query "username" required!' });
        }

        let page = parseInt(req.query.page) || 1
        page = page < 1 ? 1 : page
        let limit = parseInt(req.query.limit) || 10
        limit = limit > 50 ? 50 : limit
        const skip = (page - 1) * limit
        const searchText = new RegExp(username.trim(), 'i'); // Case-insensitive

        const users = await User.find({
            // Match ANY of these:
            $or: [
                { firstName: searchText },
                { lastName: searchText },
                {
                    $expr: {
                        $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: searchText }
                    }
                }
            ]
        }).select(SAFE_DATA).skip(skip).limit(limit).sort({ firstName: 1 });

        // $or -> Performs a logical OR operation on an array of one or more expressions and selects documents that satisfy at least one of the expressions.
        // $expr -> Allows the use of expressions within a query predicate.
        // $regexMatch -> Performs a regular expression (regex) pattern matching and returns:

        res.status(200).json({ message: `Search Complete`, data: users })
    } catch (err) {
        res.status(500).json({ message: `Something went wrong: ${err}` })
    }
})

module.exports = userRouter 