const mongoose = require('mongoose')

const floorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  context: {
    type: String,
    enum: ['building', 'campus'],
    default: 'building',
  },
  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
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
