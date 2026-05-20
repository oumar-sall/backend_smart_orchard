const express = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();
const activityLogController = require('../controllers/activityLog.controller');

// All activity log routes require authentication
router.use(authenticateToken);

router.get('/', activityLogController.getActivityLogs);
router.get('/:id', activityLogController.getLogById);

module.exports = router;
