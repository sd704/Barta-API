const mongoose = require('mongoose')
const validator = require('validator')
const jwt = require('jsonwebtoken')
const JWTKEY = process.env.JWTKEY
const { SAFE_DATA } = require("../utils/constant")

const userSchema = new mongoose.Schema({
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    fullName: { type: String, trim: true, index: true }, // For Indexing
    email: {
        type: String, unique: true, required: true, lowercase: true, trim: true,
        // Custom Validation
        validate(value) {
            if (!validator.isEmail(value)) {
                throw new Error(`Invalid Email ${value}!`)
            }
        }
    },
    password: {
        type: String, required: true, minlength: 8,
        // Custom Validation
        validate(value) {
            const options = { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }
            if (!validator.isStrongPassword(value, options)) {
                throw new Error(`Password must be 8+ characters long with uppercase, lowercase, number, and symbol`)
            }
        }
    },
    about: { type: String, max: 60, trim: true },
    description: { type: String, max: 200, trim: true },
    age: { type: Number, min: 18 },
    gender: {
        type: String, lowercase: true, enum: {
            values: ["male", "female", "other"],
            message: `Invalid gender: {VALUE}`
        }
    },
    pfp: { type: String, default: "https://icon-library.com/images/no-user-image-icon/no-user-image-icon-29.jpg", trim: true }
}, {
    timestamps: true
})

// This function executes before model.save()
userSchema.pre("validate", function () {
    const first = this.firstName ? this.firstName.trim() : ''
    const last = this.lastName ? this.lastName.trim() : ''
    this.fullName = `${first} ${last}`.trim()
})

// Arrow function will not work here because arrow function don't have 'this' binding
userSchema.methods.getJWT = async function () {
    const userObj = this
    const token = await jwt.sign({ _id: userObj._id }, JWTKEY, { expiresIn: '7d' });
    return token
}

userSchema.methods.filterSafeData = function () {
    const userObj = this
    return Object.fromEntries(Object.entries(userObj.toJSON()).filter(([key]) => SAFE_DATA.includes(key)))
}

const User = mongoose.model('User', userSchema)
module.exports = { User }