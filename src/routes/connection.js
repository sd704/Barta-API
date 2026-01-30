const express = require('express');
const connectionRouter = express.Router();

// List of received connection requests
connectionRouter.get('/api/requests', async (req, res) => { })

// List of existing connections
connectionRouter.get('/api/connections', async (req, res) => { })

// List of users who are not connected
connectionRouter.get('/api/requestfeed', async (req, res) => { })

// List of blocked users
connectionRouter.get('/api/blocked', async (req, res) => { })

// Send, Ignore, Accept, Reject, Block, Un-block request
connectionRouter.post('/api/requests/:status/:id', async (req, res) => { })

module.exports = connectionRouter 