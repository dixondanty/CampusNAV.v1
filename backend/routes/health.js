const express = require('express')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ message: 'CampusAR API is running.' })
})

module.exports = router
