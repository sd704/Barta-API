const mongoose = require('mongoose');
const URL = process.env.URL;

const connectDB = async () => {
    await mongoose.connect(URL)
}

module.exports = {
    connectDB
}