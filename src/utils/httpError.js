// Only for code that runs inside a DB transaction (runInTransaction) and the policy helpers it calls.
// Throwing rolls the transaction back, and errorHandler sends statusCode and message.
// Anywhere else, send the response directly with res.status(...).json(...).
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode })

module.exports = { httpError }