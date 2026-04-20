const express = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();
const activityLogController = require('../controllers/activityLog.controller');

// Toutes les routes du journal nécessitent une authentification
router.use(authenticateToken);

router.get('/', activityLogController.getActivityLogs);
router.get('/:id', activityLogController.getLogById);

module.exports = router;
