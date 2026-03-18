const { Router } = require('express');
const ReadingController = require('../controllers/reading.controller');

const router = Router();

router.get('/dashboard', ReadingController.getLatestDashboard);

module.exports = router;
