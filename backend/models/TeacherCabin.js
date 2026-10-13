const mongoose = require('mongoose')

const teacherCabinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    staffroomRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      required: true,
    },
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('TeacherCabin', teacherCabinSchema)
