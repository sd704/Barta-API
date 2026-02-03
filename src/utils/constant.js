const SAFE_DATA = ["_id", "firstName", "lastName", "email", "age", "gender", "pfp"]
const ALLOWED_UPDATES = ["firstName", "lastName", "age", "gender", "pfp"]
const CONNECTION_SAFE_DATA = ["senderId", "receiverId", "status", "createdAt"]
module.exports = { SAFE_DATA, ALLOWED_UPDATES, CONNECTION_SAFE_DATA }