const { tokenAuth } = require("../middleware/tokenAuth")
const { getLoggedInUser, signupUser, updateUser, deleteUser } = require("../controller/userController")
const express = require('express')
const userRouter = express.Router()

// Return Logged In User data
userRouter.get('/api/users', tokenAuth, getLoggedInUser)

// Add new user to DB/ SignUp
userRouter.post('/api/users', signupUser)

// Update user
userRouter.patch('/api/users', tokenAuth, updateUser)

// Delete user
userRouter.delete('/api/users', tokenAuth, deleteUser)

module.exports = userRouter 