const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addComment,
  addAttachment,
  removeAttachment,
  downloadAttachment
} = require('../controllers/taskController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Validation
const createTaskValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('assignedTo').notEmpty().withMessage('Task must be assigned to a user'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  body('priority').optional().isIn(['High', 'Medium', 'Low']).withMessage('Invalid priority')
];

const updateTaskValidation = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('dueDate').optional().isISO8601().withMessage('Valid due date required'),
  body('priority').optional().isIn(['High', 'Medium', 'Low']).withMessage('Invalid priority'),
  body('status').optional().isIn(['To Do', 'In Progress', 'Completed']).withMessage('Invalid status')
];

const commentValidation = [
  body('text').trim().notEmpty().withMessage('Comment text is required')
];

// All routes require authentication
router.use(protect);

router.route('/')
  .get(getTasks)
  .post(createTaskValidation, createTask);

router.route('/:id')
  .get(getTask)
  .put(updateTaskValidation, updateTask)
  .delete(deleteTask);

router.post('/:id/comments', commentValidation, addComment);

router.route('/:id/attachments')
  .post(upload.single('file'), addAttachment);

router.route('/:id/attachments/:attachmentId')
  .delete(removeAttachment);

router.get('/:id/attachments/:attachmentId/download', downloadAttachment);

module.exports = router;