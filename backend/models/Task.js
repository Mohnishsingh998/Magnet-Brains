const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 2000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimetype: String,
  size: Number,
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const auditSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['created', 'updated', 'status_changed', 'priority_changed', 'assigned', 'reassigned', 'comment_added', 'attachment_added', 'attachment_removed']
  },
  field: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  description: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must be assigned to a user']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['To Do', 'In Progress', 'Completed'],
    default: 'To Do'
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  attachments: [attachmentSchema],
  comments: [commentSchema],
  auditHistory: [auditSchema],
  completedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ assignedTo: 1, priority: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ tags: 1 });

// Add audit entry helper method
taskSchema.methods.addAuditEntry = function(userId, action, details = {}) {
  this.auditHistory.push({
    user: userId,
    action,
    field: details.field,
    oldValue: details.oldValue,
    newValue: details.newValue,
    description: details.description
  });
};

// Prevent status reversion from Completed
taskSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const previousStatus = this._original?.status;
    if (previousStatus === 'Completed' && this.status !== 'Completed') {
      const error = new Error('Cannot revert status from Completed');
      error.statusCode = 400;
      return next(error);
    }
    
    // Set completedAt timestamp when status changes to Completed
    if (this.status === 'Completed' && !this.completedAt) {
      this.completedAt = new Date();
    }
  }
  next();
});

// Store original document for comparison
taskSchema.post('init', function() {
  this._original = this.toObject();
});

module.exports = mongoose.model('Task', taskSchema);