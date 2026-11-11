const dns = require('dns')
dns.setServers(['8.8.8.8', '1.1.1.1'])

require('dotenv').config()

const mongoose = require('mongoose')
const sharp = require('sharp')
const Floor = require('../models/Floor')
const {
  getFile,
  openDownloadStream,
  reportOrphanCandidate,
  uploadImage,
} = require('../services/gridFsStorage')

async function readGridFsFile(fileId) {
  const chunks = []
  for await (const chunk of openDownloadStream(fileId)) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function findExistingPreview(floor) {
  if (!floor.mapImagePreviewFileId) {
    return null
  }

  const file = await getFile(floor.mapImagePreviewFileId)
  if (!file) {
    return null
  }

  return floor.mapImagePreviewFileId
}

async function backfillFloor(floor) {
  const floorId = String(floor._id)
  const previewPath = `/api/floors/${floorId}/preview`
  const existingPreviewId = await findExistingPreview(floor)

  if (existingPreviewId) {
    const result = await Floor.updateOne(
      {
        _id: floor._id,
        mapImagePreviewFileId: existingPreviewId,
      },
      {
        $set: { mapImagePreview: previewPath },
      },
    )
    if (result.modifiedCount === 1) {
      console.log(`Restored preview path for floor ${floorId}.`)
    } else {
      console.log(`Skipped floor ${floorId}; another process already updated it.`)
    }
    return 'processed'
  }

  if (!floor.mapImageFileId) {
    console.warn(`Skipped floor ${floorId}; no original GridFS file ID exists.`)
    return 'skipped'
  }

  const originalBuffer = await readGridFsFile(floor.mapImageFileId)
  const previewBuffer = await sharp(originalBuffer)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer()
  const uploadedPreviewId = await uploadImage(
    previewBuffer,
    'image/webp',
    `${floorId}.preview.webp`,
  )

  try {
    const result = await Floor.updateOne(
      {
        _id: floor._id,
        mapImageFileId: floor.mapImageFileId,
        $or: [
          { mapImagePreview: { $exists: false } },
          { mapImagePreview: '' },
          { mapImagePreviewFileId: { $exists: false } },
          { mapImagePreviewFileId: null },
        ],
      },
      {
        $set: {
          mapImagePreview: previewPath,
          mapImagePreviewFileId: uploadedPreviewId,
        },
      },
    )

    if (result.modifiedCount !== 1) {
      reportOrphanCandidate(
        uploadedPreviewId,
        `backfill update skipped for floor ${floorId}; retained for deferred safe cleanup`,
      )
      console.log(`Skipped floor ${floorId}; another process already updated it.`)
      return 'skipped'
    }
  } catch (error) {
    reportOrphanCandidate(
      uploadedPreviewId,
      `backfill update failed for floor ${floorId}; retained for deferred safe cleanup`,
    )
    throw error
  }

  console.log(`Created preview for floor ${floorId}.`)
  return 'processed'
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.')
  }

  await mongoose.connect(process.env.MONGODB_URI)
  const floors = await Floor.find({
    mapImageFileId: { $exists: true, $ne: null },
    $or: [
      { mapImagePreview: { $exists: false } },
      { mapImagePreview: '' },
      { mapImagePreviewFileId: { $exists: false } },
      { mapImagePreviewFileId: null },
    ],
  })
    .select('_id mapImageFileId mapImagePreview mapImagePreviewFileId')
    .sort({ _id: 1 })

  let processed = 0
  let skipped = 0
  let failed = 0
  for (const floor of floors) {
    try {
      const result = await backfillFloor(floor)
      if (result === 'processed') {
        processed += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      failed += 1
      console.error(`Failed to backfill floor ${floor._id}: ${error.message}`)
    }
  }

  console.log(`Backfill complete. Processed: ${processed}; skipped: ${skipped}; failed: ${failed}.`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(`Preview backfill failed: ${error.message}`)
      process.exitCode = 1
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect()
      }
    })
}
