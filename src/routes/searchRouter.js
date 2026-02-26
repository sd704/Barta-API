const { tokenAuth } = require("../middleware/tokenAuth")
const { pagination } = require('../middleware/pagination')
const { getBlockList } = require("../middleware/getBlockList")
const { findUsersByName, findUserByEmail, findUserById } = require("../controller/searchController")
const express = require('express')
const searchRouter = express.Router()

// Search users using name
// http://localhost:7000/api/search/username?username=Max&page=1&limit=10
searchRouter.get('/api/search/username', tokenAuth, pagination, getBlockList, findUsersByName)

// Search user using email
// /api/search/email?email=test@gmail.com
searchRouter.get('/api/search/email', tokenAuth, findUserByEmail)

// /api/search/id?id=685346828
// Gets user data and connection status with logged in user
searchRouter.get('/api/search/id', tokenAuth, findUserById)

module.exports = searchRouter 