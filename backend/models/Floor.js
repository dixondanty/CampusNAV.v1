const mongoose = require('mongoose')

const floorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  floorNumber: {
    type: Number,
    required: true,
  },
  mapImage: {
    type: String,
    default: '',
  },
})

module.exports = mongoose.model('Floor', floorSchema)
