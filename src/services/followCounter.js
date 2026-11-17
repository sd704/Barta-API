const { Journal } = require("../model/journal")
const { createCounter } = require("./counter")

// Only active follows are counted.
const {
    increment: incrementFollowerCount,
    decrement: decrementFollowerCount
} = createCounter(Journal, "followerCount")

module.exports = { incrementFollowerCount, decrementFollowerCount }

