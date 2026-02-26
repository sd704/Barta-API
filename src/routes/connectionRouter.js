const { tokenAuth } = require("../middleware/tokenAuth")
const { pagination } = require('../middleware/pagination')
const { getBlockList } = require("../middleware/getBlockList")
const { receivedRequests, sentRequests, existingConnections, suggestedUsers, blockedUsers, getConnectionStatus } = require("../controller/connectionController")

const express = require('express')
const connectionRouter = express.Router()

// List of received connection requests (not accepted)
connectionRouter.get('/api/connections/received', tokenAuth, pagination, getBlockList, receivedRequests)

// List of sent connection requests (not accepted)
connectionRouter.get('/api/connections/sent', tokenAuth, pagination, getBlockList, sentRequests)

// List of existing connections
connectionRouter.get('/api/connections/accepted', tokenAuth, pagination, getBlockList, existingConnections)

// List of users who are not connected
connectionRouter.get('/api/connections/feed', tokenAuth, pagination, getBlockList, suggestedUsers)

// List of blocked users
connectionRouter.get('/api/connections/blocked', tokenAuth, pagination, blockedUsers)

// Get Connection details and also Blocked details
connectionRouter.get('/api/connections/status/:id', tokenAuth, getConnectionStatus)

module.exports = connectionRouter


