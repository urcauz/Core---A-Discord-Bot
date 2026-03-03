const mongoose = require('mongoose');

const standupSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      index: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    yesterday: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000
    },
    today: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000
    },
    blockers: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000
    },
    submittedAt: {
      type: Date,
      default: null
    },
    reminded: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

standupSchema.index({ date: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Standup', standupSchema);
