const { tokenAuth } = require("../middleware/tokenAuth")
const { blockListCheck } = require("../middleware/blockListCheck")
const {
    sendConnectRequest,
    ignoreRequest,
    acceptRequest,
    rejectRequest,
    withdrawRequest,
    removeRequest,
    blockRequest,
    unblockRequest
} = require("../controller/requestController")

const express = require('express')
const requestRouter = express.Router()

// It automatically wraps async route so errors go to Express error middleware.
const errorHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// interested -> Send Connection request
requestRouter.post('/api/request/:id/interested', tokenAuth, blockListCheck, errorHandler(sendConnectRequest))

// ignored -> Ignore Profile
requestRouter.post('/api/request/:id/ignored', tokenAuth, blockListCheck, errorHandler(ignoreRequest))

// accepted -> Accept Connection Request
requestRouter.patch('/api/request/:id/accepted', tokenAuth, blockListCheck, errorHandler(acceptRequest))

// rejected -> Reject Connection Request
requestRouter.patch('/api/request/:id/rejected', tokenAuth, blockListCheck, errorHandler(rejectRequest))

// withdraw -> Withdraw Connection Request
requestRouter.delete('/api/request/:id/withdraw', tokenAuth, blockListCheck, errorHandler(withdrawRequest))

// remove -> Remove Connection
requestRouter.delete('/api/request/:id/remove', tokenAuth, blockListCheck, errorHandler(removeRequest))

// blocked -> Block User, Blocked users cannot see the blockers profile/posts, and cannot send requests
requestRouter.post('/api/block/:id', tokenAuth, errorHandler(blockRequest))

// unblock -> Un-Block User
requestRouter.delete('/api/block/:id', tokenAuth, errorHandler(unblockRequest))

module.exports = requestRouter 