const crypto = require('node:crypto')
const express = require('express')
const mongoose = require('mongoose')
const Building = require('../models/Building')
const Connection = require('../models/Connection')
const Floor = require('../models/Floor')
const Node = require('../models/Node')
const TeacherCabin = require('../models/TeacherCabin')
const { decorateCabins } = require('../services/cabinDestination')
const { getFile, openDownloadStream } = require('../services/gridFsStorage')

const router = express.Router()

function plainRecords(records) {
  return records.map((record) => record.toObject())
}

async function readDataset(session) {
  const buildings = await Building.find().sort({ _id: 1 }).session(session)
  const floors = await Floor.find().sort({ _id: 1 }).session(session)
  const nodes = await Node.find().sort({ _id: 1 }).session(session)
  const connections = await Connection.find().sort({ _id: 1 }).session(session)
  const cabinRecords = await TeacherCabin.find().sort({ _id: 1 }).session(session)
  const cabins = await decorateCabins(cabinRecords, { session })

  return {
    buildings: plainRecords(buildings),
    floors: plainRecords(floors),
    nodes: plainRecords(nodes),
    connections: plainRecords(connections),
    cabins,
  }
}

async function readVersionedDataset() {
  const session = await Building.startSession()
  let result
  try {
    await session.withTransaction(async () => {
      const dataset = await readDataset(session)
      const digest = crypto
        .createHash('sha256')
        .update(JSON.stringify(dataset))
        .digest('hex')
      result = { version: `sha256-${digest}`, dataset }
    }, { readConcern: { level: 'snapshot' } })
  } finally {
    await session.endSession()
  }

  if (!result) {
    throw new Error('Campus data snapshot was not created.')
  }
  return result
}

router.get('/version', async (req, res) => {
  try {
    const { version } = await readVersionedDataset()
    res.set('Cache-Control', 'no-store')
    res.json({ version })
  } catch (error) {
    console.error('Offline campus-data version check failed:', error.message)
    res.status(503).json({ message: 'Campus data version is temporarily unavailable.' })
  }
})

router.get('/dataset', async (req, res) => {
  try {
    const result = await readVersionedDataset()
    res.set('Cache-Control', 'no-store')
    if (req.query.version && req.query.version !== result.version) {
      return res.status(409).json({
        message: 'Campus data changed while the download was starting.',
        version: result.version,
      })
    }
    res.json(result)
  } catch (error) {
    console.error('Offline campus-data snapshot failed:', error.message)
    res.status(503).json({ message: 'Campus data snapshot is temporarily unavailable.' })
  }
})

router.get('/maps/:fileId', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
    return res.status(400).json({ message: 'Invalid map image ID.' })
  }
  const file = await getFile(req.params.fileId)
  if (!file) {
    return res.status(404).json({ message: 'Map image not found.' })
  }

  const etag = `"${file._id}-${file.length}-${file.uploadDate ? new Date(file.uploadDate).getTime() : 0}"`
  res.set('Cache-Control', 'no-store')
  res.set('ETag', etag)
  res.type(file.metadata?.contentType || 'application/octet-stream')
  openDownloadStream(req.params.fileId).on('error', (error) => {
    console.error(`Offline map download failed for ${req.params.fileId}:`, error.message)
    if (!res.headersSent) {
      res.status(404).end()
    }
  }).pipe(res)
})

module.exports = router
