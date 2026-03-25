const { tokenAuth } = require("../middleware/tokenAuth")
const { pagination } = require('../middleware/pagination')
const { userIdValidation } = require("../middleware/userIdValidation")
const { getMessages, getChats } = require('../controller/chatController')
const express = require('express')
const chatRouter = express.Router()

// Get messages exchanged with a particular user
chatRouter.get('/api/chats/:uid', tokenAuth, pagination, userIdValidation, getMessages)

// Get list of users with existing chat
chatRouter.get('/api/chats', tokenAuth, pagination, getChats)

module.exports = chatRouter 