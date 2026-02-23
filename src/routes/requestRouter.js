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

// Middleware
const idSimilarityCheck = async (req, res, next) => {
    if (req.userObj._id.equals(req.params.id)) {
        return res.status(400).json({ message: "Sender and receiver cannot be the same!" });
    }
    next()
}

// interested -> Send Connection request
requestRouter.post('/api/requests/:id/interested', tokenAuth, blockListCheck, idSimilarityCheck, sendConnectRequest)

// ignored -> Ignore Profile
requestRouter.post('/api/requests/:id/ignored', tokenAuth, blockListCheck, idSimilarityCheck, ignoreRequest)

// accepted -> Accept Connection Request
requestRouter.patch('/api/requests/:id/accepted', tokenAuth, blockListCheck, idSimilarityCheck, acceptRequest)

// rejected -> Reject Connection Request
requestRouter.patch('/api/requests/:id/rejected', tokenAuth, blockListCheck, idSimilarityCheck, rejectRequest)

// withdraw -> Withdraw Connection Request
requestRouter.delete('/api/requests/:id/withdraw', tokenAuth, blockListCheck, idSimilarityCheck, withdrawRequest)

// remove -> Remove Connection
requestRouter.delete('/api/requests/:id/remove', tokenAuth, blockListCheck, idSimilarityCheck, removeRequest)

// blocked -> Block User, Blocked users cannot see the blockers profile/posts, and cannot send requests
requestRouter.post('/api/blocks/:id', tokenAuth, idSimilarityCheck, blockRequest)

// unblock -> Un-Block User
requestRouter.delete('/api/blocks/:id', tokenAuth, idSimilarityCheck, unblockRequest)

module.exports = requestRouter 