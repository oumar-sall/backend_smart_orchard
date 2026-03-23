const { Router } = require('express');
const ReadingController = require('../controllers/reading.controller');

const router = Router();

router.get('/dashboard', ReadingController.getLatestDashboard);
router.get('/history', ReadingController.getHistory);
router.get('/status', ReadingController.getControllerStatus);
router.post('/irrigation', ReadingController.toggleIrrigation);

module.exports = router;
