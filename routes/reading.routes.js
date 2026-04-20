const { Router } = require('express');
const ReadingController = require('../controllers/reading.controller');
const SettingController = require('../controllers/setting.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

// Toutes les routes de lecture et commande nécessitent une authentification
router.use(authenticateToken);

router.get('/dashboard', ReadingController.getLatestDashboard);
router.get('/history', ReadingController.getHistory);
router.get('/status', ReadingController.getControllerStatus);
router.get('/actuators', ReadingController.getActuators);
router.get('/sensors', ReadingController.getSensors);
router.post('/irrigation', ReadingController.toggleIrrigation);
router.post('/simulate', ReadingController.simulateHumidity); // 🧪 Test seuil auto
router.post('/components', ReadingController.createComponent);
router.put('/components/:id', ReadingController.updateComponent);
router.delete('/components/:id', ReadingController.deleteComponent);

// Paramètres
router.get('/settings', SettingController.getSettings);
router.put('/settings', SettingController.updateSettings);

module.exports = router;
