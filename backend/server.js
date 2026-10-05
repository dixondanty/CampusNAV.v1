const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require('dotenv').config()

const cors = require('cors')
const express = require('express')
const mongoose = require('mongoose')
const path = require('node:path')
const connectionsRoute = require('./routes/connections')
const floorsRoute = require('./routes/floors')
const healthRoute = require('./routes/health')
const navigationRoute = require('./routes/navigation')
const nodesRoute = require('./routes/nodes')
const Floor = require('./models/Floor')
const Node = require('./models/Node')

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/api/health', healthRoute)
app.use('/api/floors', floorsRoute)
app.use('/api/nodes', nodesRoute)
app.use('/api/connections', connectionsRoute)
app.get('/api/navigation/bootstrap', async (req, res) => {
  try {
    const [floors, roomNodes] = await Promise.all([
      Floor.find().sort({ floorNumber: 1 }),
      Node.find({ type: 'room' }),
    ])
    const floorById = new Map(floors.map((floor) => [String(floor._id), floor]))
    const rooms = roomNodes.flatMap((node) => {
      const floor = floorById.get(String(node.floorId))
      if (!floor) {
        return []
      }

      return [{
        ...node.toObject(),
        floorId: String(floor._id),
        floorName: floor.name,
        floorNumber: floor.floorNumber,
      }]
    })

    res.json({ floors, rooms })
  } catch (error) {
    console.error('Navigation bootstrap failed:', error.message)
    res.status(500).json({ message: 'Could not load navigation data.' })
  }
})
app.use('/api/navigation', navigationRoute)

if (!process.env.MONGODB_URI) {
  console.error('MongoDB connection failed: MONGODB_URI is missing. Add it to backend/.env.')
  process.exit(1)
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully.')
    app.listen(port, () => {
      console.log(`CampusAR API listening on port ${port}`)
    })
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message)
    process.exit(1)
  })

app.use((error, req, res, next) => {
  if (error.name === 'MulterError' || error.status === 400) {
    return res.status(400).json({ message: error.message })
  }

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message })
  }

  if (error.code === 11000) {
    return res.status(409).json({ message: 'A record with that unique value already exists.' })
  }

  console.error('API request failed:', error.message)
  res.status(500).json({ message: 'An unexpected server error occurred.' })
})
