const express = require('express')
const Connection = require('../models/Connection')
const Building = require('../models/Building')
const Floor = require('../models/Floor')
const Node = require('../models/Node')
const { normalizeBuildingConnectionFields } = require('../services/validation')

const router = express.Router()

router.get('/:floorId', async (req, res) => {
  const nodes = await Node.find({ floorId: req.params.floorId })
  res.json(nodes)
})

router.post('/', async (req, res) => {
  let connectionType
  let connectionGroup

  // Every node must reference an existing floor; load it once and reuse it
  // for the type-specific validation below.
  const floor = await Floor.findById(req.body.floorId)
  if (!floor) {
    return res.status(404).json({ message: 'Floor not found.' })
  }

  if (req.body.type === 'buildingConnection') {
    const fields = normalizeBuildingConnectionFields(
      req.body.connectionType,
      req.body.connectionGroup,
    )
    connectionType = fields.connectionType
    connectionGroup = fields.connectionGroup

    if (fields.error) {
      return res.status(400).json({ message: fields.error })
    }

    if (floor.context !== 'building' || !floor.buildingId) {
      return res.status(400).json({
        message: 'Building connection nodes must belong to an assigned building floor.',
      })
    }

    const building = await Building.findById(floor.buildingId)
    if (!building) {
      return res.status(400).json({
        message: 'Building connection nodes must belong to an existing building.',
      })
    }
  }

  if (req.body.type === 'stair') {
    const stairPart = Number(req.body.stairPart)
    const stairGroup = typeof req.body.stairGroup === 'string'
      ? req.body.stairGroup.trim()
      : ''
    if (![1, 2].includes(stairPart)) {
      return res.status(400).json({ message: 'Stair part must be 1 or 2.' })
    }

    if (req.body.stairGroup !== undefined && typeof req.body.stairGroup !== 'string') {
      return res.status(400).json({ message: 'Stair group must be text.' })
    }

    // Stairs exist only inside a building. Campus ground-map floors carry no
    // buildingId, so they do not support stair nodes.
    if (!floor.buildingId) {
      return res.status(400).json({
        message: 'Stair nodes can only be placed on floors assigned to a building.',
      })
    }

    // Compute the stair boundaries using only this building's floors, so other
    // buildings and the Campus Ground Map can never affect the min/max.
    const floors = await Floor.find({ buildingId: floor.buildingId }).select('floorNumber')
    const floorNumbers = floors.map((item) => item.floorNumber)
    const lowestFloor = Math.min(...floorNumbers)
    const highestFloor = Math.max(...floorNumbers)
    if (
      lowestFloor === highestFloor ||
      (floor.floorNumber === lowestFloor && stairPart === 1) ||
      (floor.floorNumber === highestFloor && stairPart === 2)
    ) {
      return res.status(400).json({
        message: 'The lowest floor only allows Part 2 and the highest floor only allows Part 1.',
      })
    }
  }

  const node = await Node.create({
    name: req.body.type === 'stair'
      ? `${req.body.stairGroup?.trim() ? `${req.body.stairGroup.trim()} - ` : ''}Stair P${req.body.stairPart}`
      : req.body.name,
    type: req.body.type,
    stairGroup: req.body.type === 'stair' && req.body.stairGroup?.trim()
      ? req.body.stairGroup.trim()
      : undefined,
    stairPart: req.body.type === 'stair' ? Number(req.body.stairPart) : undefined,
    connectionType,
    connectionGroup,
    x: req.body.x,
    y: req.body.y,
    floorId: req.body.floorId,
  })
  res.status(201).json(node)
})

router.patch('/:id', async (req, res) => {
  if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
    return res.status(400).json({ message: 'Node name cannot be empty.' })
  }

  const node = await Node.findById(req.params.id)
  if (!node) {
    return res.status(404).json({ message: 'Node not found.' })
  }

  node.name = req.body.name.trim()
  await node.save()
  res.json(node)
})

router.delete('/:id', async (req, res) => {
  const node = await Node.findById(req.params.id)
  if (!node) {
    return res.status(404).json({ message: 'Node not found.' })
  }

  await Connection.deleteMany({
    $or: [{ from: node._id }, { to: node._id }],
  })
  await node.deleteOne()

  res.json({ message: 'Node deleted.' })
})

module.exports = router
