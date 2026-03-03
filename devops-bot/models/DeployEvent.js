const mongoose = require('mongoose');

const DEPLOY_STATUSES = ['Success', 'Failure'];

const deployEventSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    status: {
      type: String,
      enum: DEPLOY_STATUSES,
      required: true,
      index: true
    },
    branch: {
      type: String,
      default: 'N/A',
      trim: true,
      maxlength: 120
    },
    project: {
      type: String,
      default: 'N/A',
      trim: true,
      maxlength: 200,
      index: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
);

deployEventSchema.index({ timestamp: -1 });
deployEventSchema.index({ status: 1 });
deployEventSchema.index({ project: 1 });

module.exports = {
  DeployEvent: mongoose.model('DeployEvent', deployEventSchema),
  DEPLOY_STATUSES
};
