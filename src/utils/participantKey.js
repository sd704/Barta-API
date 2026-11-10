// Pair key for Connection.participants, BlockList.participants and Chat.participantsKey. Same key in either order.
const participantKey = (leftId, rightId) => [leftId.toString(), rightId.toString()].sort().join("|")

module.exports = { participantKey }

