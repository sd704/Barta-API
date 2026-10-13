const express = require("express")
const cookieParser = require('cookie-parser')
const { connectDB } = require("./config/database")
const authRouter = require('./routes/authRouter')
const userRouter = require('./routes/userRouter')
const connectionRouter = require('./routes/connectionRouter')
const requestRouter = require('./routes/requestRouter')
const searchRouter = require('./routes/searchRouter')
const chatRouter = require('./routes/chatRouter')
const journalRouter = require("./routes/journalRouter")
const entryRouter = require("./routes/entryRouter")
const { startSummaryWorker } = require("./services/journalSummaryService")
const engagementRouter = require("./routes/engagementRouter")
const commentRouter = require("./routes/commentRouter")
const subscriptionRouter = require("./routes/subscriptionRouter")
const { notFound, errorHandler } = require("./middleware/errorHandler")

const cors = require('cors')
const http = require('http')
const { initializeSocket } = require('./config/socket')

// Express App
const app = express()

// For handling cors
app.use(cors({ origin: "http://localhost:5173", credentials: true, }))

// We need this to read JSON data send in requests, 1mb is maximum allowed JSON body size
app.use(express.json({ limit: "1mb" }))

// We need this to read cookies
app.use(cookieParser())

app.use('/', authRouter)
app.use('/', userRouter)
app.use('/', searchRouter)
app.use('/', requestRouter)
app.use('/', connectionRouter)
app.use('/', chatRouter)
app.use("/", journalRouter)
app.use("/", entryRouter)
app.use("/", engagementRouter)
app.use("/", commentRouter)
app.use("/", subscriptionRouter)

// After every router. notFound answers unmatched routes. errorHandler answers thrown errors.
app.use(notFound)
app.use(errorHandler)

const server = http.createServer(app)

initializeSocket(server)

connectDB().then(() => {
    console.log("Database connected successfully")

    startSummaryWorker()

    // We want our database to connect before the server starts listening
    // So this is a good approach to connect DB first, then listen to PORT
    server.listen(7000, () => {
        console.log("Server listening on PORT 7000")
    })
}).catch((err) => {
    console.error(`Database connection unsuccessfull, Error: ${err}`)
})