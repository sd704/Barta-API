
// Fields that a follower, commenter or library card can see
const publicProfile = user => user ? ({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    pfp: user.pfp,
    about: user.about
}) : null

// A missing user, such as a deleted follower, has no stored name.
const displayName = user => user?.fullName || "This user"

// Inbox and live message cards. An unknown user keeps the id used by /messages/:uid and nothing else.
const visibleChatUser = user => ({
    _id: user._id,
    fullName: user.fullName,
    firstName: user.firstName || "",
    pfp: user.pfp ?? null,
    email: user.email,
    isUnknown: false
})

const hiddenChatUser = id => ({ _id: id, isUnknown: true })

module.exports = {
    publicProfile,
    displayName,
    visibleChatUser,
    hiddenChatUser
}


