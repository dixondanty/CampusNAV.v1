const express = require('express')
const mongoose = require('mongoose')
const Building = require('../models/Building')
const Connection = require('../models/Connection')
const Floor = require('../models/Floor')
const Node = require('../models/Node')

const router = express.Router()
const protectedBuildingId = '6ac7e6d91280162920d68aa7'

async function findDuplicateName(name, excludedBuildingId) {
  const buildings = await Building.find({
    _id: { $ne: excludedBuildingId },
  }).select('name')
  const normalizedName = name.trim().toLocaleLowerCase()
  return buildings.some((building) =>
    building.name.trim().toLocaleLowerCase() === normalizedName,
  )
}

async function getDependencies(buildingId) {
  const floors = await Floor.find({ buildingId }).select('_id')
  const floorIds = floors.map((floor) => floor._id)
  const nodes = floorIds.length
    ? await Node.find({ floorId: { $in: floorIds } }).select('_id')
    : []
  const nodeIds = nodes.map((node) => node._id)
  const connections = nodeIds.length
    ? await Connection.countDocuments({
      $or: [
        { from: { $in: nodeIds } },
        { to: { $in: nodeIds } },
      ],
    })
    : 0

  return {
    floors: floors.length,
    nodes: nodes.length,
    connections,
  }
}

function dependencyMessage({ floors, nodes, connections }) {
  const dependencies = []
  if (floors) dependencies.push(`${floors} floor${floors === 1 ? '' : 's'}`)
  if (nodes) dependencies.push(`${nodes} node${nodes === 1 ? '' : 's'}`)
  if (connections) {
    dependencies.push(`${connections} connection${connections === 1 ? '' : 's'}`)
  }
  return `Building cannot be deleted while it has associated ${dependencies.join(', ')}.`
}

router.get('/', async (req, res) => {
  const buildings = await Building.find().sort({ name: 1 })
  res.json(buildings)
})

router.post('/', async (req, res) => {
  if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
    return res.status(400).json({ message: 'Building name cannot be empty.' })
  }

  if (req.body.description !== undefined && typeof req.body.description !== 'string') {
    return res.status(400).json({ message: 'Building description must be text.' })
  }


  const name = req.body.name.trim()

  if (await findDuplicateName(name, null)) {
    return res.status(409).json({
      message: 'A building with that name already exists.',
    })
  }


  const building = await Building.create({
    name,
    description: req.body.description?.trim() || undefined,
  })
  res.status(201).json(building)
})

router.patch('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid building ID.' })
  }

  const body = req.body || {}
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return res.status(400).json({ message: 'Building name cannot be empty.' })
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    return res.status(400).json({ message: 'Building description must be text.' })
  }

  const building = await Building.findById(req.params.id)
  if (!building) {
    return res.status(404).json({ message: 'Building not found.' })
  }

  const name = body.name.trim()
  if (await findDuplicateName(name, building._id)) {
    return res.status(409).json({ message: 'A building with that name already exists.' })
  }

  building.name = name
  if (body.description !== undefined) {
    building.description = body.description.trim()
  }
  await building.save()

  res.json(building)
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid building ID.' })
  }

  const building = await Building.findById(req.params.id)
  if (!building) {
    return res.status(404).json({ message: 'Building not found.' })
  }

  if (String(building._id) === protectedBuildingId) {
    return res.status(403).json({ message: 'Main Building cannot be deleted.' })
  }

  const dependencies = await getDependencies(building._id)
  if (dependencies.floors || dependencies.nodes || dependencies.connections) {
    return res.status(409).json({ message: dependencyMessage(dependencies) })
  }

  const currentBuilding = await Building.findById(req.params.id)
  if (!currentBuilding) {
    return res.status(404).json({ message: 'Building not found.' })
  }
  if (String(currentBuilding._id) === protectedBuildingId) {
    return res.status(403).json({ message: 'Main Building cannot be deleted.' })
  }

  const latestDependencies = await getDependencies(currentBuilding._id)
  if (latestDependencies.floors || latestDependencies.nodes || latestDependencies.connections) {
    return res.status(409).json({ message: dependencyMessage(latestDependencies) })
  }

  const result = await Building.deleteOne({
    _id: currentBuilding._id,
  })
  if (result.deletedCount !== 1) {
    return res.status(404).json({ message: 'Building not found.' })
  }

  res.json({ message: 'Building deleted.' })
})

module.exports = router
