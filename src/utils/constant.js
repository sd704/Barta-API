const SAFE_DATA = ["_id", "firstName", "lastName", "email", "about", "description", "age", "gender", "pfp"]
const ALLOWED_UPDATES = ["firstName", "lastName", "about", "description", "age", "gender", "pfp"]
const CONNECTION_SAFE_DATA = ["senderId", "receiverId", "status", "createdAt"]
module.exports = { SAFE_DATA, ALLOWED_UPDATES, CONNECTION_SAFE_DATA }