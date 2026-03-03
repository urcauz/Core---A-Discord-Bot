const mongoose = require('mongoose');

const BUG_ENVIRONMENTS = ['Development', 'Staging', 'Production'];
const BUG_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const BUG_STATUSES = ['Open', 'Investigating', 'Fixed', 'Closed'];

const bugSchema = new mongoose.Schema(
  {
    bugId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    environment: {
      type: String,
      enum: BUG_ENVIRONMENTS,
      required: true
    },
    severity: {
      type: String,
      enum: BUG_SEVERITIES,
      required: true,
      index: true
    },
    stepsToReproduce: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000
    },
    expectedResult: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },
    actualResult: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },
    project: {
      type: String,
      default: 'General',
      trim: true,
      maxlength: 100,
      index: true
    },
    status: {
      type: String,
      enum: BUG_STATUSES,
      default: 'Open',
      index: true
    },
    reportedBy: {
      type: String,
      required: true
    },
    assignedTo: {
      type: String,
      default: null,
      index: true
    },
    threadId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = {
  Bug: mongoose.model('Bug', bugSchema),
  BUG_ENVIRONMENTS,
  BUG_SEVERITIES,
  BUG_STATUSES
};
