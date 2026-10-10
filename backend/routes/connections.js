const express = require('express')
const mongoose = require('mongoose')
const Connection = require('../models/Connection')
const Building = require('../models/Building')
const Floor = require('../models/Floor')
const Node = require('../models/Node')
const {
  isSameFloorConnectionAllowed,
  isSkywalkEndpointPair,
  skywalkFloorsValid,
  shareSameBuildingId,
  skywalkEndpointsMatch,
  isValidCrossBuildingDistance,
  stairConnectionMatches,
  resolveConnectionDistance,
} = require('../services/validation')

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
      select: 'name type stairGroup stairPart connectionType connectionGroup x y floorId',
      populate: { path: 'floorId', select: 'name floorNumber' },
    })
    .populate({
      path: 'to',
      select: 'name type stairGroup stairPart connectionType connectionGroup x y floorId',
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
  const fromIsBuildingConnection = fromNode.type === 'buildingConnection'
  const toIsBuildingConnection = toNode.type === 'buildingConnection'
  let connectionFromNode = fromNode
  let connectionToNode = toNode
  let distance

  if (sameFloor) {
    if (!isSameFloorConnectionAllowed(fromNode.type, toNode.type, fromNode.stairPart, toNode.stairPart)) {
      return res.status(400).json({
        message: 'Connect navigation nodes to nodes, rooms, stairs, or building connections; stairs may also connect to the other stair part.',
      })
    }
  } else {
    if (fromIsBuildingConnection || toIsBuildingConnection) {
      if (!isSkywalkEndpointPair(fromNode.type, toNode.type)) {
        return res.status(400).json({
          message: 'Building connections can connect across buildings only to other building connection nodes.',
        })
      }

      const [fromFloor, toFloor] = await Promise.all([
        Floor.findById(fromNode.floorId),
        Floor.findById(toNode.floorId),
      ])

      if (!fromFloor || !toFloor) {
        return res.status(400).json({
          message: 'Both building connection nodes must belong to existing floors.',
        })
      }

      if (!skywalkFloorsValid(fromFloor.context, fromFloor.buildingId, toFloor.context, toFloor.buildingId)) {
        return res.status(400).json({
          message: 'Skywalk endpoints must belong to assigned building floors.',
        })
      }

      const [fromBuilding, toBuilding] = await Promise.all([
        Building.findById(fromFloor.buildingId),
        Building.findById(toFloor.buildingId),
      ])

      if (!fromBuilding || !toBuilding) {
        return res.status(400).json({
          message: 'Both skywalk endpoint floors must reference existing buildings.',
        })
      }

      if (shareSameBuildingId(fromBuilding._id, toBuilding._id)) {
        return res.status(400).json({
          message: 'Building connections cannot connect floors in the same building.',
        })
      }

      if (
        !skywalkEndpointsMatch(
          fromNode.connectionType,
          toNode.connectionType,
          fromNode.connectionGroup,
          toNode.connectionGroup,
        )
      ) {
        return res.status(400).json({
          message: 'Skywalk endpoints must have the same connection type and group.',
        })
      }

      if (!isValidCrossBuildingDistance(req.body.distance)) {
        return res.status(400).json({
          message: 'A finite, non-negative distance is required for cross-building connections.',
        })
      }

      distance = req.body.distance
    } else if (!fromIsStair || !toIsStair) {
      return res.status(400).json({ message: 'Only stair nodes can connect across floors.' })
    } else {
      const [fromFloor, toFloor] = await Promise.all([
        Floor.findById(fromNode.floorId),
        Floor.findById(toNode.floorId),
      ])

      if (!fromFloor || !toFloor) {
        return res.status(400).json({ message: 'Both stair nodes must belong to existing floors.' })
      }

      // Stairs only span floors of the same building; never link staircases
      // across separate buildings or between a building and the campus map.
      if (!shareSameBuildingId(fromFloor.buildingId, toFloor.buildingId)) {
        return res.status(400).json({
          message: 'Cross-floor stair connections must belong to the same building.',
        })
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
        !stairConnectionMatches(
          upperFloor.floorNumber,
          lowerFloor.floorNumber,
          lowerNode.stairPart,
          upperNode.stairPart,
          lowerStairGroup,
          upperStairGroup,
        )
      ) {
        return res.status(400).json({
          message: 'Connect matching stair groups: Part 2 on a floor to Part 1 on the immediately higher floor.',
        })
      }
      connectionFromNode = lowerNode
      connectionToNode = upperNode
    }
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

  distance = resolveConnectionDistance(
    distance,
    connectionFromNode.x,
    connectionFromNode.y,
    connectionToNode.x,
    connectionToNode.y,
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
