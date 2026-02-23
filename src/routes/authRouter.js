const { handleLogin, handleLogout } = require('../controller/authController')

const express = require('express')
const authRouter = express.Router()

// It automatically wraps async route so errors go to Express error middleware.
// Technically this is not required in Express version 5+
const errorHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

authRouter.post('/api/auth/login', errorHandler(handleLogin))

authRouter.post('/api/auth/logout', errorHandler(handleLogout))

module.exports = authRouter 