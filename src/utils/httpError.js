const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode })

module.exports = { httpError }

