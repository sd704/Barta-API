const mongoose = require("mongoose")

// Every id that comes from a client goes through normalizeId before it is used.
// MongoDB ids are stored and compared as lowercase hex. Block, friend and chat keys, socket room names, and the
// online-user map are plain strings, so "64B0..." and "64b0..." would be two different ids there.
// A string is lowercased first, then checked with ObjectId.isValid. Anything else is rejected.

const normalizeId = value => {
    if (typeof value !== "string") return null
    const id = value.toLowerCase()
    return mongoose.Types.ObjectId.isValid(id) ? id : null
}

module.exports = { normalizeId }

