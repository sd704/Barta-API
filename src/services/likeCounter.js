const { Entry } = require("../model/entry")
const { createCounter } = require("./counter")

const {
    increment: incrementLikeCount,
    decrement: decrementLikeCount
} = createCounter(Entry, "likeCount")

module.exports = { incrementLikeCount, decrementLikeCount }

