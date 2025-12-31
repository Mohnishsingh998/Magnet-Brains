const Task = require('../models/Task');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');

// @desc    Get all tasks assigned to current user
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res, next) => {
  try {
    const { status, priority, tags, search, sortBy = 'dueDate', order = 'asc' } = req.query;

    // Build query
    const query = {
      assignedTo: req.user.id,
      isDeleted: false
    };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (tags) query.tags = { $in: tags.split(',') };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sortOrder = order === 'desc' ? -1 : 1;
    const sort = { [sortBy]: sortOrder };

    const tasks = await Task.find(query)
      .sort(sort)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('auditHistory.user', 'name email');

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    })
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('auditHistory.user', 'name email');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create task
// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res, next) => {
  try {
    const { title, description, assignedTo, dueDate, priority, tags } = req.body;

    // Verify assigned user exists
    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) {
      return res.status(404).json({
        success: false,
        message: 'Assigned user not found'
      });
    }

    const task = await Task.create({
      title,
      description,
      assignedTo,
      createdBy: req.user.id,
      dueDate,
      priority: priority || 'Medium',
      tags: tags || [],
      status: 'To Do'
    });

    // Add audit entry
    task.addAuditEntry(req.user.id, 'created', {
      description: `Task created and assigned to ${assignedUser.name}`
    });
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(assignedTo, {
        type: 'TASK_CREATED',
        task: populatedTask
      });
    }

    res.status(201).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res, next) => {
  try {
    let task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    const { title, description, dueDate, priority, tags, status } = req.body;

    // Track changes for audit
    const changes = [];

    if (title && title !== task.title) {
      changes.push({ field: 'title', oldValue: task.title, newValue: title });
      task.title = title;
    }

    if (description !== undefined && description !== task.description) {
      changes.push({ field: 'description', oldValue: task.description, newValue: description });
      task.description = description;
    }

    if (dueDate && new Date(dueDate).getTime() !== task.dueDate.getTime()) {
      changes.push({ field: 'dueDate', oldValue: task.dueDate, newValue: dueDate });
      task.dueDate = dueDate;
    }

    if (priority && priority !== task.priority) {
      changes.push({ field: 'priority', oldValue: task.priority, newValue: priority });
      task.addAuditEntry(req.user.id, 'priority_changed', {
        field: 'priority',
        oldValue: task.priority,
        newValue: priority
      });
      task.priority = priority;
    }

    if (status && status !== task.status) {
      // Prevent reverting from Completed
      if (task.status === 'Completed' && status !== 'Completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot revert status from Completed'
        });
      }
      
      changes.push({ field: 'status', oldValue: task.status, newValue: status });
      task.addAuditEntry(req.user.id, 'status_changed', {
        field: 'status',
        oldValue: task.status,
        newValue: status
      });
      task.status = status;
    }

    if (tags) {
      task.tags = tags;
    }

    // Add general update audit entry if there were changes
    if (changes.length > 0) {
      const changedFields = changes.map(c => c.field).join(', ');
      task.addAuditEntry(req.user.id, 'updated', {
        description: `Updated: ${changedFields}`
      });
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('auditHistory.user', 'name email');

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(task.assignedTo.toString(), {
        type: 'TASK_UPDATED',
        task: populatedTask
      });
    }

    res.status(200).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    // Soft delete
    task.isDeleted = true;
    await task.save();

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(task.assignedTo.toString(), {
        type: 'TASK_DELETED',
        taskId: task._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
// @access  Private
exports.addComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    const { text } = req.body;

    task.comments.push({
      user: req.user.id,
      text
    });

    task.addAuditEntry(req.user.id, 'comment_added', {
      description: 'Added a comment'
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email')
      .populate('auditHistory.user', 'name email');

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(task.assignedTo.toString(), {
        type: 'TASK_UPDATED',
        task: populatedTask
      });
    }

    res.status(200).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add attachment to task
// @route   POST /api/tasks/:id/attachments
// @access  Private
exports.addAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }

    task.attachments.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.id
    });

    task.addAuditEntry(req.user.id, 'attachment_added', {
      description: `Added attachment: ${req.file.originalname}`
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('auditHistory.user', 'name email');

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(task.assignedTo.toString(), {
        type: 'TASK_UPDATED',
        task: populatedTask
      });
    }

    res.status(200).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove attachment from task
// @route   DELETE /api/tasks/:id/attachments/:attachmentId
// @access  Private
exports.removeAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    const attachment = task.attachments.id(req.params.attachmentId);

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // Delete file from filesystem
    const filePath = path.join(process.env.UPLOAD_PATH || './uploads', attachment.filename);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error('Error deleting file:', err);
    }

    task.addAuditEntry(req.user.id, 'attachment_removed', {
      description: `Removed attachment: ${attachment.originalName}`
    });

    task.attachments.pull(req.params.attachmentId);
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('auditHistory.user', 'name email');

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcastToUser(task.assignedTo.toString(), {
        type: 'TASK_UPDATED',
        task: populatedTask
      });
    }

    res.status(200).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download attachment
// @route   GET /api/tasks/:id/attachments/:attachmentId/download
// @access  Private
exports.downloadAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    const attachment = task.attachments.id(req.params.attachmentId);

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    const filePath = path.join(process.env.UPLOAD_PATH || './uploads', attachment.filename);

    res.download(filePath, attachment.originalName);
  } catch (error) {
    next(error);
  }
};