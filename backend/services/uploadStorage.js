const fs = require('node:fs')
const path = require('node:path')

const uploadDirectory = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
)

fs.mkdirSync(uploadDirectory, { recursive: true })

module.exports = { uploadDirectory }
