const express = require('express')
const Floor = require('../models/Floor')
const Node = require('../models/Node')
const TeacherCabin = require('../models/TeacherCabin')
const { decorateCabins } = require('../services/cabinDestination')

const router = express.Router()

function parseCoordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// Validate and normalise a cabin payload covering both create and update.
async function validateCabinPayload(payload) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name) {
    return { error: 'Cabin name cannot be empty.' }
  }

  const teacherName = typeof payload.teacherName === 'string' ? payload.teacherName.trim() : ''
  if (!teacherName) {
    return { error: 'Teacher name cannot be empty.' }
  }

  if (!payload.floorId) {
    return { error: 'Cabin must belong to a floor.' }
  }
  const floor = await Floor.findById(payload.floorId)
  if (!floor) {
    return { error: 'Floor not found.', status: 404 }
  }

  if (!payload.staffroomRoomId) {
    return { error: 'A staffroom must be selected.' }
  }
  const staffroom = await Node.findById(payload.staffroomRoomId)
  if (!staffroom) {
    return { error: 'Staffroom not found.', status: 404 }
  }
  if (staffroom.type !== 'room') {
    return { error: 'Selected staffroom must be a room node.' }
  }
  if (String(staffroom.floorId) !== String(floor._id)) {
    return { error: 'Staffroom must be on the same floor as the cabin.' }
  }

  const x = parseCoordinate(payload.x)
  const y = parseCoordinate(payload.y)
  if (x === null || y === null || x < 0 || x > 100 || y < 0 || y > 100) {
    return { error: 'Cabin coordinates must be between 0 and 100.' }
  }

  return {
    value: {
      name,
      teacherName,
      floorId: floor._id,
      staffroomRoomId: staffroom._id,
      x,
      y,
    },
  }
}

router.get('/', async (req, res) => {
  const filter = req.query.floorId ? { floorId: req.query.floorId } : {}
  const cabins = await TeacherCabin.find(filter).sort({ createdAt: 1 })
  res.json(await decorateCabins(cabins))
})

router.get('/:id', async (req, res) => {
  const cabin = await TeacherCabin.findById(req.params.id)
  if (!cabin) {
    return res.status(404).json({ message: 'Cabin not found.' })
  }

  const [decorated] = await decorateCabins([cabin])
  res.json(decorated)
})

router.post('/', async (req, res) => {
  const { error, status, value } = await validateCabinPayload(req.body)
  if (error) {
    return res.status(status || 400).json({ message: error })
  }

  const cabin = await TeacherCabin.create(value)
  const [decorated] = await decorateCabins([cabin])
  res.status(201).json(decorated)
})

router.patch('/:id', async (req, res) => {
  const cabin = await TeacherCabin.findById(req.params.id)
  if (!cabin) {
    return res.status(404).json({ message: 'Cabin not found.' })
  }

  const { error, status, value } = await validateCabinPayload({
    name: req.body.name ?? cabin.name,
    teacherName: req.body.teacherName ?? cabin.teacherName,
    floorId: req.body.floorId ?? cabin.floorId,
    staffroomRoomId: req.body.staffroomRoomId ?? cabin.staffroomRoomId,
    x: req.body.x ?? cabin.x,
    y: req.body.y ?? cabin.y,
  })
  if (error) {
    return res.status(status || 400).json({ message: error })
  }

  Object.assign(cabin, value)
  await cabin.save()

  const [decorated] = await decorateCabins([cabin])
  res.json(decorated)
})

router.delete('/:id', async (req, res) => {
  // Deleting a cabin only removes the cabin marker; the staffroom room, any
  // navigation nodes and every connection are left untouched.
  const cabin = await TeacherCabin.findByIdAndDelete(req.params.id)
  if (!cabin) {
    return res.status(404).json({ message: 'Cabin not found.' })
  }

  res.json({ message: 'Cabin deleted.' })
})

module.exports = router
