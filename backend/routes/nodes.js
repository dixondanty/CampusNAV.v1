const express = require('express')
const Connection = require('../models/Connection')
const Building = require('../models/Building')
const Floor = require('../models/Floor')
const Node = require('../models/Node')

const router = express.Router()

router.get('/:floorId', async (req, res) => {
  const nodes = await Node.find({ floorId: req.params.floorId })
  res.json(nodes)
})

router.post('/', async (req, res) => {
  let connectionType
  let connectionGroup

  if (req.body.type === 'buildingConnection') {
    connectionType = typeof req.body.connectionType === 'string'
      ? req.body.connectionType.trim()
      : ''
    connectionGroup = typeof req.body.connectionGroup === 'string'
      ? req.body.connectionGroup.trim()
      : ''

    if (!connectionType || !connectionGroup) {
      return res.status(400).json({
        message: 'Building connection type and group are required.',
      })
    }

    if (connectionType !== 'skywalk') {
      return res.status(400).json({ message: 'Unsupported building connection type.' })
    }

    const floor = await Floor.findById(req.body.floorId)
    if (!floor) {
      return res.status(404).json({ message: 'Floor not found.' })
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

    const floor = await Floor.findById(req.body.floorId)
    if (!floor) {
      return res.status(404).json({ message: 'Floor not found.' })
    }

    const floors = await Floor.find().select('floorNumber')
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
