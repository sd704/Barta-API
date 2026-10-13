const publicProfile = user => user ? ({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    pfp: user.pfp,
    about: user.about
}) : null

const displayName = user =>
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "This user"

module.exports = {
    publicProfile,
    displayName
}

