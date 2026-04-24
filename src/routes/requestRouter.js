const { tokenAuth } = require("../middleware/tokenAuth")
const { blockListCheck } = require("../middleware/blockListCheck")
const { userIdValidation } = require("../middleware/userIdValidation")
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
    if (req.userObj._id.equals(req.params.uid)) {
        return res.status(400).json({ message: "Sender and receiver cannot be the same!" });
    }
    next()
}

// interested -> Send Connection request
requestRouter.post('/api/requests/:uid/interested', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, sendConnectRequest)

// ignored -> Ignore Profile
requestRouter.post('/api/requests/:uid/ignored', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, ignoreRequest)

// accepted -> Accept Connection Request
requestRouter.patch('/api/requests/:uid/accepted', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, acceptRequest)

// rejected -> Reject Connection Request
requestRouter.patch('/api/requests/:uid/rejected', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, rejectRequest)

// withdraw -> Withdraw Connection Request
requestRouter.delete('/api/requests/:uid/withdraw', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, withdrawRequest)

// remove -> Remove Connection
requestRouter.delete('/api/requests/:uid/remove', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, removeRequest)

// blocked -> Block User, Blocked users cannot see the blockers profile/posts, and cannot send requests
requestRouter.post('/api/blocks/:uid', tokenAuth, idSimilarityCheck, userIdValidation, blockListCheck, blockRequest)

// unblock -> Un-Block User
requestRouter.delete('/api/blocks/:uid', tokenAuth, idSimilarityCheck, userIdValidation, unblockRequest)

module.exports = requestRouter 