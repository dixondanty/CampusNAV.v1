const express = require('express')
const multer = require('multer')
const mongoose = require('mongoose')
const Building = require('../models/Building')
const Floor = require('../models/Floor')
const Node = require('../models/Node')
const Connection = require('../models/Connection')
const TeacherCabin = require('../models/TeacherCabin')
const {
  getFile,
  openDownloadStream,
  reportOrphanCandidate,
  uploadImage,
} = require('../services/gridFsStorage')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      const error = new Error('Please upload an image file.')
      error.status = 400
      callback(error)
      return
    }

    callback(null, true)
  },
  limits: { fileSize: 15 * 1024 * 1024 },
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

    const duplicateFloor = await Floor.findOne({ buildingId, floorNumber: req.body.floorNumber })
    if (duplicateFloor) {
      return res.status(409).json({ message: 'A floor with that number already exists in this building.' })
    }
  }

  let uploadedImage = null
  let createdFloor = null
  try {
    if (req.file) {
      uploadedImage = await uploadImage(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      )
    }

    createdFloor = await Floor.create({
      name: req.body.name,
      context,
      ...(buildingId ? { buildingId } : {}),
      floorNumber: req.body.floorNumber,
      mapImage: uploadedImage ? '' : req.body.mapImage,
      ...(uploadedImage ? { mapImageFileId: uploadedImage } : {}),
    })
    if (uploadedImage) {
      createdFloor.mapImage = `/api/floors/${createdFloor._id}/image`
      await createdFloor.save()
    }
    res.status(201).json(createdFloor)
  } catch (saveError) {
    if (uploadedImage) {
      reportOrphanCandidate(uploadedImage, 'failed floor write; retained for deferred reference audit')
    }
    if (createdFloor) {
      try {
        await Floor.deleteOne({ _id: createdFloor._id })
      } catch (recordCleanupError) {
        console.error(`Floor record cleanup failed for ${createdFloor._id}:`, recordCleanupError.message)
      }
    }
    throw saveError
  }
})

router.get('/:id/image', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid floor ID.' })
  }
  const floor = await Floor.findById(req.params.id).select('mapImageFileId')
  if (!floor || !floor.mapImageFileId) {
    return res.status(404).json({ message: 'Floor image not found.' })
  }
  const file = await getFile(floor.mapImageFileId)
  if (!file) {
    return res.status(404).json({ message: 'Floor image not found.' })
  }
  res.type(file.metadata?.contentType || 'application/octet-stream')
  res.set('Cache-Control', 'no-store')
  openDownloadStream(floor.mapImageFileId).on('error', (error) => {
    console.error(`GridFS download failed for ${floor.mapImageFileId}:`, error.message)
    if (!res.headersSent) res.status(404).end()
  }).pipe(res)
})

router.patch('/:id/image', upload.single('mapImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'A map image file is required.' })
  }

  const floor = await Floor.findById(req.params.id)
  if (!floor) {
    return res.status(404).json({ message: 'Floor not found.' })
  }

  const uploadedImage = await uploadImage(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname,
  )
  const previousImageId = floor.mapImageFileId
  try {
    floor.mapImage = `/api/floors/${floor._id}/image`
    floor.mapImageFileId = uploadedImage
    await floor.save()
  } catch (saveError) {
    reportOrphanCandidate(uploadedImage, 'failed replacement write; retained for deferred reference audit')
    throw saveError
  }

  if (previousImageId && String(previousImageId) !== String(uploadedImage)) {
    reportOrphanCandidate(previousImageId, 'replaced floor image retained for deferred safe cleanup')
  }
  res.json(floor)
})

router.delete('/:id', async (req, res) => {
  const floorId = req.params.id

  // Verify the floor exists before attempting any deletion.
  const floor = await Floor.findById(floorId)
  if (!floor) {
    return res.status(404).json({ message: 'Floor not found.' })
  }

  // Collect the IDs of every node on this floor so we can scope all deletes
  // precisely — never touching nodes or connections from other floors.
  const nodes = await Node.find({ floorId }).select('_id')
  const nodeIds = nodes.map((n) => n._id)

  // Build the connection filter once for the transaction's scoped deletes.
  const connectionFilter = nodeIds.length > 0
    ? { $or: [{ from: { $in: nodeIds } }, { to: { $in: nodeIds } }] }
    : null

  // ── Delete atomically via a MongoDB session/transaction ─────────────────────
  // Multi-document transactions require a replica set or mongos (MongoDB Atlas
  // qualifies).  All three deletes run inside a single transaction and are
  // committed only after every one succeeds, so a mid-sequence failure rolls
  // back automatically and the database is never left partially deleted.
  //
  // If transactions are unavailable or any operation fails, the transaction is
  // aborted (when appropriate) and the error propagates to the Express error
  // handler.  The deletion is never retried outside the transaction and no
  // success is reported.
  let session = null
  try {
    session = await Floor.db.client.startSession()
    session.startTransaction()

    if (connectionFilter) {
      await Connection.deleteMany(connectionFilter, { session })
      await Node.deleteMany({ floorId }, { session })
    }
    // Remove teacher cabins on this floor or linked to a staffroom on it so no
    // cabin is left referencing a deleted floor or room.
    const cabinFilter = nodeIds.length > 0
      ? { $or: [{ floorId }, { staffroomRoomId: { $in: nodeIds } }] }
      : { floorId }
    await TeacherCabin.deleteMany(cabinFilter, { session })
    await floor.deleteOne({ session })

    await session.commitTransaction()
  } catch (txError) {
    // Roll back any work in the failed transaction, then re-throw for Express
    // 5's global error handler (which returns HTTP 500).
    if (session && session.inTransaction()) {
      await session.abortTransaction()
    }
    throw txError
  } finally {
    if (session) {
      session.endSession()
    }
  }

  if (floor.mapImageFileId) {
    reportOrphanCandidate(floor.mapImageFileId, 'deleted floor image retained for deferred safe cleanup')
  }
  res.json({ message: 'Floor deleted.' })
})

module.exports = router
