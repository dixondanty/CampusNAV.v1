const mongoose = require('mongoose')

const connectionSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Node',
    required: true,
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Node',
    required: true,
  },
  distance: {
    type: Number,
    required: true,
    min: 0,
  },
})

module.exports = mongoose.model('Connection', connectionSchema)
