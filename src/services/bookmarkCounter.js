const { Entry } = require("../model/entry")
const { createCounter } = require("./counter")

const {
    increment: incrementBookmarkCount,
    decrement: decrementBookmarkCount
} = createCounter(Entry, "bookmarkCount")

module.exports = { incrementBookmarkCount, decrementBookmarkCount }

