const express = require('express')
const mongoose = require('mongoose')
const Connection = require('../models/Connection')
const Node = require('../models/Node')
const runDijkstra = require('../services/dijkstra')

const router = express.Router()

router.get('/path', async (req, res) => {
  const { start, end } = req.query

  if (!mongoose.Types.ObjectId.isValid(start) || !mongoose.Types.ObjectId.isValid(end)) {
    return res.status(400).json({ message: 'Valid start and end node IDs are required.' })
  }

  const startId = new mongoose.Types.ObjectId(start).toString()
  const endId = new mongoose.Types.ObjectId(end).toString()
  if (startId === endId) {
    return res.status(400).json({ message: 'Start and end nodes must be different.' })
  }

  const [startNode, endNode] = await Promise.all([
    Node.findById(start),
    Node.findById(end),
  ])

  if (!startNode || !endNode) {
    return res.status(404).json({ message: 'Start or end node was not found.' })
  }

  const [nodes, connections] = await Promise.all([
    Node.find().select('_id name type stairPart x y floorId'),
    Connection.find().select('from to distance'),
  ])
  const result = runDijkstra(startId, endId, nodes, connections)

  res.json({
    success: true,
    found: result.found,
    path: result.path,
    distance: result.distance,
  })
})

module.exports = router
