
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

// A comment stays after its author deletes their account. Readers see this name and no profile id.
const commentAuthor = user => publicProfile(user) || {
    fullName: "Deleted User",
    firstName: null,
    lastName: null,
    pfp: null,
    about: null
}

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
    commentAuthor,
    visibleChatUser,
    hiddenChatUser
}


