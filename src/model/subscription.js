const mongoose = require("mongoose")
const { SUBSCRIPTION_PRICE } = require("../utils/constant")

const subscriptionSchema = new mongoose.Schema({
    subscriberId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, default: SUBSCRIPTION_PRICE.amount, immutable: true },
    currency: { type: String, required: true, default: SUBSCRIPTION_PRICE.currency, immutable: true },
    paidAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true })

subscriptionSchema.index({ subscriberId: 1, authorId: 1 }, { unique: true })

const Subscription = mongoose.model("Subscription", subscriptionSchema)
module.exports = { Subscription }

