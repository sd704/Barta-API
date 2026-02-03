const express = require("express")
const cookieParser = require('cookie-parser')
const { connectDB } = require("./config/database")
const authRouter = require('./routes/auth')
const userRouter = require('./routes/profile')
const connectionRouter = require('./routes/connection')
const requestRouter = require('./routes/requests')
const searchRouter = require('./routes/search')

// Express App
const app = express()

// We need this to read JSON data send in requests
app.use(express.json())

// We need this to read cookies
app.use(cookieParser())

app.use('/', authRouter)
app.use('/', userRouter)
app.use('/', searchRouter)
app.use('/', requestRouter)
app.use('/', connectionRouter)

// The 404 catch-all (after all routes)
app.use('/', (req, res, next) => {
    res.status(404).json({ message: `Route not found: ${req.originalUrl}` })
});

// This order is important err,req,res,next. This will handle all routes.
app.use("/", (err, req, res, next) => {
    console.log("Something went wrong")
    res.status(500).json({ message: `Something went wrong: ${err}` })
})

connectDB().then(() => {
    console.log("Database connected successfully")

    // We want our database to connect before the server starts listening
    // So this is a good approach to connect DB first, then listen to PORT
    app.listen(7000, () => {
        console.log("Server listening on PORT 7000")
    })
}).catch((err) => {
    console.error(`Database connection unsuccessfull, Error: ${err}`)
})