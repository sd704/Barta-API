const mongoose = require("mongoose")

// Runs work(session) in one transaction and returns what work returned.
// withTransaction commits on success, rolls back on a throw, and retries work on transient transaction errors.
// work can run more than once, so it should not change anything outside the session before it returns.
const runInTransaction = async (work) => {
    const session = await mongoose.startSession()
    let result

    try {
        await session.withTransaction(async () => {
            result = await work(session)
        })
    } finally {
        await session.endSession()
    }

    return result
}

module.exports = { runInTransaction }