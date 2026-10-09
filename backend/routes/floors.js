const express = require('express')
const multer = require('multer')
const path = require('node:path')
const crypto = require('node:crypto')
const Building = require('../models/Building')
const Floor = require('../models/Floor')

const router = express.Router()
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`)
    },
  }),
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      const error = new Error('Please upload an image file.')
      error.status = 400
      callback(error)
      return
    }

    callback(null, true)
  },
  limits: { fileSize: 5 * 1024 * 1024 },
})

router.get('/', async (req, res) => {
  const floors = await Floor.find().sort({ floorNumber: 1 })
  res.json(floors)
})

router.post('/', upload.single('mapImage'), async (req, res) => {
  const context = req.body.context || 'building'
  const buildingId = req.body.buildingId

  if (!['building', 'campus'].includes(context)) {
    return res.status(400).json({ message: 'Floor context must be building or campus.' })
  }

  if (context === 'campus' && buildingId) {
    return res.status(400).json({ message: 'Campus floors cannot belong to a building.' })
  }

  if (context === 'building' && !buildingId) {
    return res.status(400).json({ message: 'Building floors must belong to a building.' })
  }

  if (buildingId) {
    const building = await Building.findById(buildingId)
    if (!building) {
      return res.status(404).json({ message: 'Building not found.' })
    }
  }

  const floor = await Floor.create({
    name: req.body.name,
    context,
    ...(buildingId ? { buildingId } : {}),
    floorNumber: req.body.floorNumber,
    mapImage: req.file ? `/uploads/${req.file.filename}` : req.body.mapImage,
  })
  res.status(201).json(floor)
})

router.delete('/:id', async (req, res) => {
  const floor = await Floor.findByIdAndDelete(req.params.id)
  if (!floor) {
    return res.status(404).json({ message: 'Floor not found.' })
  }

  res.json({ message: 'Floor deleted.' })
})

module.exports = router
