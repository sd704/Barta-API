// Pair key for Connection.participants, BlockList.participants and Chat.participantsKey. Same key in either order.
// Always lowercase, so the key matches the stored ones even for an id that was not normalized by the caller.
const participantKey = (leftId, rightId) => [leftId, rightId].map(id => id.toString().toLowerCase()).sort().join("|")

module.exports = { participantKey }

