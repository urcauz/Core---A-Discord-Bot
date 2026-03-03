const mongoose = require('mongoose');

const TASK_STATUSES = ['Backlog', 'In Progress', 'Review', 'Blocked', 'Completed'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const taskSchema = new mongoose.Schema(
  {
    taskId: {
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
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000
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
      enum: TASK_STATUSES,
      default: 'Backlog',
      index: true
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'Medium'
    },
    assignedTo: {
      type: String,
      default: null,
      index: true
    },
    createdBy: {
      type: String,
      required: true
    },
    deadline: {
      type: Date,
      default: null
    },
    threadId: {
      type: String,
      default: null
    },
    archived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

taskSchema.index({ taskId: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ project: 1 });

module.exports = {
  Task: mongoose.model('Task', taskSchema),
  TASK_STATUSES,
  TASK_PRIORITIES
};
