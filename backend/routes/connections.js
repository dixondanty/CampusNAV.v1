const express = require('express')
const mongoose = require('mongoose')
const Connection = require('../models/Connection')
const Floor = require('../models/Floor')
const Node = require('../models/Node')

const router = express.Router()

router.get('/:floorId', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.floorId)) {
    return res.status(400).json({ message: 'Invalid floor ID.' })
  }

  const nodes = await Node.find({ floorId: req.params.floorId }).select('_id')
  const nodeIds = nodes.map((node) => node._id)
  const connections = await Connection.find({
    $or: [{ from: { $in: nodeIds } }, { to: { $in: nodeIds } }],
  })
    .populate({
      path: 'from',
      select: 'name type stairGroup stairPart x y floorId',
      populate: { path: 'floorId', select: 'name floorNumber' },
    })
    .populate({
      path: 'to',
      select: 'name type stairGroup stairPart x y floorId',
      populate: { path: 'floorId', select: 'name floorNumber' },
    })

  res.json(connections)
})

router.post('/', async (req, res) => {
  const { from, to } = req.body
  const ObjectId = mongoose.Types.ObjectId

  if (!ObjectId.isValid(from) || !ObjectId.isValid(to)) {
    return res.status(400).json({ message: 'Valid from and to node IDs are required.' })
  }

  if (from === to) {
    return res.status(400).json({ message: 'A node cannot be connected to itself.' })
  }

  const [fromNode, toNode] = await Promise.all([
    Node.findById(from),
    Node.findById(to),
  ])

  if (!fromNode || !toNode) {
    return res.status(404).json({ message: 'Both nodes must exist.' })
  }

  const sameFloor = fromNode.floorId.toString() === toNode.floorId.toString()
  const fromIsStair = fromNode.type === 'stair'
  const toIsStair = toNode.type === 'stair'
  let connectionFromNode = fromNode
  let connectionToNode = toNode

  if (sameFloor) {
    const bothNavigation = fromNode.type === 'nav' && toNode.type === 'nav'
    const roomNavigation =
      (fromNode.type === 'room' && toNode.type === 'nav') ||
      (fromNode.type === 'nav' && toNode.type === 'room')
    const navigationStair =
      (fromNode.type === 'nav' && toIsStair) ||
      (toNode.type === 'nav' && fromIsStair)
    const oppositeStairParts =
      fromIsStair && toIsStair && fromNode.stairPart !== toNode.stairPart

    if (!(bothNavigation || roomNavigation || navigationStair || oppositeStairParts)) {
      return res.status(400).json({
        message: 'Connect navigation nodes to nodes or rooms, and connect stairs to navigation nodes or the other stair part.',
      })
    }
  } else {
    if (!fromIsStair || !toIsStair) {
      return res.status(400).json({ message: 'Only stair nodes can connect across floors.' })
    }

    const [fromFloor, toFloor] = await Promise.all([
      Floor.findById(fromNode.floorId),
      Floor.findById(toNode.floorId),
    ])

    if (!fromFloor || !toFloor) {
      return res.status(400).json({ message: 'Both stair nodes must belong to existing floors.' })
    }

    const lowerNode = fromFloor.floorNumber < toFloor.floorNumber ? fromNode : toNode
    const upperNode = lowerNode === fromNode ? toNode : fromNode
    const lowerFloor = lowerNode === fromNode ? fromFloor : toFloor
    const upperFloor = lowerNode === fromNode ? toFloor : fromFloor
    const lowerStairGroup = typeof lowerNode.stairGroup === 'string'
      ? lowerNode.stairGroup.trim()
      : ''
    const upperStairGroup = typeof upperNode.stairGroup === 'string'
      ? upperNode.stairGroup.trim()
      : ''

    if (
      upperFloor.floorNumber - lowerFloor.floorNumber !== 1 ||
      lowerNode.stairPart !== 2 ||
      upperNode.stairPart !== 1 ||
      lowerStairGroup !== upperStairGroup
    ) {
      return res.status(400).json({
        message: 'Connect matching stair groups: Part 2 on a floor to Part 1 on the immediately higher floor.',
      })
    }
    connectionFromNode = lowerNode
    connectionToNode = upperNode
  }

  const existingConnection = await Connection.findOne({
    $or: [
      { from: fromNode._id, to: toNode._id },
      { from: toNode._id, to: fromNode._id },
    ],
  })

  if (existingConnection) {
    return res.status(409).json({ message: 'These nodes are already connected.' })
  }

  const distance = Math.sqrt(
    Math.pow(connectionToNode.x - connectionFromNode.x, 2) +
      Math.pow(connectionToNode.y - connectionFromNode.y, 2),
  )
  const connection = await Connection.create({
    from: connectionFromNode._id,
    to: connectionToNode._id,
    distance,
  })
  res.status(201).json(connection)
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid connection ID.' })
  }

  const connection = await Connection.findByIdAndDelete(req.params.id)
  if (!connection) {
    return res.status(404).json({ message: 'Connection not found.' })
  }

  res.json({ message: 'Connection deleted.' })
})

module.exports = router
