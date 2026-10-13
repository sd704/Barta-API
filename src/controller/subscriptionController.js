const { Subscription } = require("../model/subscription")
const { SUBSCRIPTION_PRICE } = require("../utils/constant")

// For GET "/api/authors/:uid/subscription"
const getSubscriptionStatus = async (req, res) => {
    const authorId = req.params.uid

    if (req.userObj._id.equals(authorId)) {
        return res.status(400).json({ message: "You cannot subscribe to yourself" })
    }

    const subscription = await Subscription.findOne({ subscriberId: req.userObj._id, authorId }).select("amount currency paidAt").lean()

    if (!subscription) {
        return res.status(200).json({ message: "You are not subscribed to this author", data: { subscribed: false, ...SUBSCRIPTION_PRICE } })
    }

    res.status(200).json({
        message: "You are subscribed to this author",
        data: { subscribed: true, amount: subscription.amount, currency: subscription.currency, paidAt: subscription.paidAt }
    })
}

module.exports = { getSubscriptionStatus }



