const { User } = require("../model/user")
const { deleteAccountData } = require("../services/accountCleanup")
const { runInTransaction } = require("../utils/transaction")
const bcrypt = require('bcrypt')

const getLoggedInUser = async (req, res, next) => {
    res.status(200).json({ message: `Loggedin user data`, data: req.userObj.filterSafeData() })
}

const signupUser = async (req, res, next) => {
    // Body already checked by validateSignup
    const { password, ...profile } = req.validatedBody

    const passwordHash = await bcrypt.hash(password, 10)
    const userObj = { ...profile, password: passwordHash }

    // Creating a new instance of User model
    const user = new User(userObj)
    let savedUser
    try {
        savedUser = await user.save()
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists" })
        throw error
    }

    const token = await user.getJWT()
    res.cookie("token", token, {
        httpOnly: true,     // prevents JS access (XSS protection)
        secure: true,       // only over HTTPS
        sameSite: "strict", // CSRF protection
    })
    res.status(201).json({ message: `User data saved successfully`, data: savedUser.filterSafeData() })
}


const updateUser = async (req, res, next) => {
    // Body already checked by validateProfileUpdate. null in validatedBody means clear.
    const user = req.userObj

    // A field that already has this value is not an update
    const updates = Object.fromEntries(Object.entries(req.validatedBody).filter(([field, value]) =>
        value === null ? (user[field] !== null && user[field] !== undefined) : value !== user[field]
    ))

    // If no update data
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided to update' })
    }

    // Mongoose turns undefined into $unset on save
    for (const [field, value] of Object.entries(updates)) {
        user[field] = value === null ? undefined : value
    }

    // Save user object
    const updatedUserData = await user.save()
    const { data, updatedFields } = updatedUserData.filterUpdates(updates)
    res.status(200).json({ message: `User data updated successfully`, data, updatedFields })
}

// Deletes the account and everything tied to it in one transaction. Comments and Chats stay.
const deleteUser = async (req, res, next) => {
    const deletedUser = req.userObj.filterSafeData()
    await runInTransaction(async session => {
        await deleteAccountData(req.userObj._id, session)
        await req.userObj.deleteOne({ session })
    })

    res.status(200).clearCookie("token").json({ message: `User deleted successfully`, data: deletedUser })
    // res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `User deleted successfully`, data: deletedUser })
}

module.exports = { getLoggedInUser, signupUser, updateUser, deleteUser }