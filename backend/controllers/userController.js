const User = require('../models/User');
const Task = require('../models/Task');

// @desc    Get all users
// @route   GET /api/users
// @access  Private
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user (with task reassignment)
// @route   DELETE /api/users/:id
// @access  Private
exports.deleteUser = async (req, res, next) => {
  try {
    const { reassignTo } = req.body;

    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has assigned tasks
    const taskCount = await Task.countDocuments({
      assignedTo: req.params.id,
      isDeleted: false
    });

    if (taskCount > 0) {
      if (!reassignTo) {
        return res.status(400).json({
          success: false,
          message: 'User has assigned tasks. Please provide reassignTo user ID.',
          taskCount
        });
      }

      // Verify reassign target exists
      const reassignUser = await User.findById(reassignTo);
      if (!reassignUser) {
        return res.status(404).json({
          success: false,
          message: 'Reassign target user not found'
        });
      }

      // Reassign all tasks
      const tasks = await Task.find({
        assignedTo: req.params.id,
        isDeleted: false
      });

      for (const task of tasks) {
        const oldAssignee = task.assignedTo;
        task.assignedTo = reassignTo;
        task.addAuditEntry(req.user.id, 'reassigned', {
          description: `Reassigned from ${user.name} to ${reassignUser.name} (user deletion)`
        });
        await task.save();

        // Broadcast to WebSocket clients
        if (global.wss) {
          global.wss.broadcastToUser(reassignTo, {
            type: 'TASK_CREATED',
            task: await Task.findById(task._id)
              .populate('assignedTo', 'name email')
              .populate('createdBy', 'name email')
          });
        }
      }
    }

    // Delete user
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      tasksReassigned: taskCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user statistics
// @route   GET /api/users/:id/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
  try {
    const userId = req.params.id;

    const stats = await Task.aggregate([
      {
        $match: {
          assignedTo: mongoose.Types.ObjectId(userId),
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          todo: {
            $sum: { $cond: [{ $eq: ['$status', 'To Do'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          },
          high: {
            $sum: { $cond: [{ $eq: ['$priority', 'High'] }, 1, 0] }
          },
          medium: {
            $sum: { $cond: [{ $eq: ['$priority', 'Medium'] }, 1, 0] }
          },
          low: {
            $sum: { $cond: [{ $eq: ['$priority', 'Low'] }, 1, 0] }
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', new Date()] },
                    { $ne: ['$status', 'Completed'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      stats: stats[0] || {
        total: 0,
        todo: 0,
        inProgress: 0,
        completed: 0,
        high: 0,
        medium: 0,
        low: 0,
        overdue: 0
      }
    });
  } catch (error) {
    next(error);
  }
};