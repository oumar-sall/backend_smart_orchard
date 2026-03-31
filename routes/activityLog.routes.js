const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLog.controller');

router.get('/', activityLogController.getActivityLogs);

module.exports = router;
