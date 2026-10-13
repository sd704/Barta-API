const { User } = require("../model/user")
const bcrypt = require('bcrypt')
const validator = require('validator')
const { ALLOWED_UPDATES } = require("../utils/constant")
const { isPlainObject } = require("../validation/common")

const PASSWORD_RULES = { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }

const getLoggedInUser = async (req, res, next) => {
    res.status(200).json({ message: `Loggedin user data`, data: req.userObj.filterSafeData() })
}

const signupUser = async (req, res, next) => {
    if (!isPlainObject(req.body)) return res.status(400).json({ message: "Request body must be an object" })

    const { firstName, lastName, email, password, age, gender, about, description, pfp } = req.body

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
        return res.status(400).json({ message: "Email and password required" })
    }

    // Checked on the plain password. The schema validator only sees the bcrypt hash, which always passes.
    if (!validator.isStrongPassword(password, PASSWORD_RULES)) {
        return res.status(400).json({ message: "Password must be 8+ characters long with uppercase, lowercase, number, and symbol" })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userObj = { firstName, lastName, email, password: passwordHash, age, gender, about, description, pfp }

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
        httpOnly: true,        // prevents JS access (XSS protection)
        secure: true,        // only over HTTPS
        sameSite: "strict",  // CSRF protection
    })
    res.status(201).json({ message: `User data saved successfully`, data: savedUser.filterSafeData() })
}

const updateUser = async (req, res, next) => {
    if (!isPlainObject(req.body)) return res.status(400).json({ message: "Request body must be an object" })

    const updates = ALLOWED_UPDATES.reduce((acc, field) => {
        // Check is field is present, and field has a different value
        if (req.body[field] !== undefined && req.body[field] !== req.userObj[field]) acc[field] = req.body[field]
        return acc
    }, {})

    // If no update data
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided to update' })
    }

    // Update user object
    Object.assign(req.userObj, updates)

    // Save user object
    const updatedUserData = await req.userObj.save()
    res.status(200).json({ message: `User data updated successfully`, data: updatedUserData.filterSafeData(), updatedFields: updates })
}

const deleteUser = async (req, res, next) => {
    const deletedUser = req.userObj.filterSafeData()
    await req.userObj.deleteOne()
    res.status(200).clearCookie("token").json({ message: `User deleted successfully`, data: deletedUser })
    // res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `User deleted successfully`, data: deletedUser })
}

module.exports = { getLoggedInUser, signupUser, updateUser, deleteUser }