const mongoose = require('mongoose')
const crypto = require('node:crypto')

const GRIDFS_BUCKET_NAME = process.env.GRIDFS_BUCKET_NAME || 'floorMaps'

function getBucket() {
  if (!mongoose.connection.db) {
    const error = new Error('GridFS storage is unavailable before MongoDB connects.')
    error.status = 503
    throw error
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: GRIDFS_BUCKET_NAME,
  })
}

function uploadImage(buffer, contentType, filename) {
  const bucket = getBucket()
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(`${crypto.randomUUID()}-${filename}`, {
      metadata: {
        contentType,
      },
    })
    uploadStream.once('error', (error) => {
      uploadStream.destroy()
      bucket.delete(uploadStream.id)
        .catch((cleanupError) => {
          console.error(`GridFS interrupted-upload cleanup failed for ${uploadStream.id}:`, cleanupError.message)
          reportOrphanCandidate(uploadStream.id, 'interrupted upload cleanup failed')
        })
        .finally(() => reject(error))
    })
    uploadStream.once('finish', () => resolve(uploadStream.id))
    uploadStream.end(buffer)
  })
}

async function deleteImage(fileId) {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    const error = new Error('Invalid GridFS file ID.')
    error.status = 400
    throw error
  }
  await getBucket().delete(new mongoose.Types.ObjectId(fileId))
}

function reportOrphanCandidate(fileId, reason) {
  console.warn(JSON.stringify({
    type: 'gridfs-orphan-candidate',
    fileId: String(fileId),
    reason,
  }))
}

function openDownloadStream(fileId) {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    const error = new Error('Invalid GridFS file ID.')
    error.status = 400
    throw error
  }
  return getBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId))
}

async function getFile(fileId) {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return null
  }
  return getBucket().find({
    _id: new mongoose.Types.ObjectId(fileId),
  }).next()
}

module.exports = {
  GRIDFS_BUCKET_NAME,
  deleteImage,
  getFile,
  openDownloadStream,
  reportOrphanCandidate,
  uploadImage,
}
