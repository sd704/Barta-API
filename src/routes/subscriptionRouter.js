const express = require("express")
const { tokenAuth } = require("../middleware/tokenAuth")
const { userIdValidation } = require("../middleware/userIdValidation")
const { getSubscriptionStatus } = require("../controller/subscriptionController")
const subscriptionRouter = express.Router()

// Whether the logged in user has paid for this author's subscribed journals
subscriptionRouter.get("/api/authors/:uid/subscription", tokenAuth, userIdValidation, getSubscriptionStatus)

module.exports = subscriptionRouter