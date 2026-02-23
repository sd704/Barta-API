const { User } = require("../model/user")
const bcrypt = require('bcrypt')

const handleLogin = async (req, res, next) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({ message: `Email and password required` })
    }

    const userObj = await User.findOne({ email })
    if (!userObj) {
        return res.status(401).json({ message: `Invalid Credentials!` })
    }

    const isPasswordValid = await bcrypt.compare(password, userObj.password)
    if (!isPasswordValid) {
        return res.status(401).json({ message: `Invalid Credentials!` })
    }

    const token = await userObj.getJWT()
    res.cookie("token", token, {
        httpOnly: true,        // prevents JS access (XSS protection)
        //secure: true,        // only over HTTPS
        sameSite: "strict",  // CSRF protection
    })
    res.status(200).json({ message: `Login Successful!`, data: userObj.filterSafeData() })
}

const handleLogout = async (req, res, next) => {
    res.status(200).clearCookie("token").json({ message: `Logout Successful!` })
    // res.status(200).cookie("token", null, { expires: new Date(Date.now()) }).json({ message: `Logout Successful!` })
}

module.exports = { handleLogin, handleLogout }