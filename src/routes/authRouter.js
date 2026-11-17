const { handleLogin, handleLogout } = require('../controller/authController')
const { validateLogin } = require("../middleware/userValidation")

const express = require('express')
const authRouter = express.Router()

authRouter.post('/api/auth/login', validateLogin, handleLogin)

authRouter.post('/api/auth/logout', handleLogout)

module.exports = authRouter