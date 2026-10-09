const mongoose = require('mongoose')

const nodeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['nav', 'room', 'stair', 'buildingConnection'],
    required: true,
  },
  stairGroup: {
    type: String,
    trim: true,
  },
  stairPart: {
    type: Number,
    enum: [1, 2],
    required: function () {
      return this.type === 'stair'
    },
  },
  connectionType: {
    type: String,
    enum: ['skywalk'],
    trim: true,
    required: function () {
      return this.type === 'buildingConnection'
    },
  },
  connectionGroup: {
    type: String,
    trim: true,
    required: function () {
      return this.type === 'buildingConnection'
    },
  },
  x: {
    type: Number,
    required: true,
  },
  y: {
    type: Number,
    required: true,
  },
  floorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Floor',
    required: true,
  },
})

module.exports = mongoose.model('Node', nodeSchema)
