const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getUsers,
  getUser,
  deleteUser,
  getUserStats
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/', getUsers);
router.get('/:id', getUser);
router.get('/:id/stats', getUserStats);
router.delete('/:id', [
  body('reassignTo').optional().isMongoId().withMessage('Invalid reassign user ID')
], deleteUser);

module.exports = router;