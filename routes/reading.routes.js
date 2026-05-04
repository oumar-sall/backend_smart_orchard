const { Router } = require('express');
const ReadingController = require('../controllers/reading.controller');
const SettingController = require('../controllers/setting.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

// Toutes les routes de lecture et commande nécessitent une authentification
router.use(authenticateToken);

/**
 * @swagger
 * /readings/dashboard:
 *   get:
 *     summary: Récupérer les données du tableau de bord
 *     tags: [Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: controller_id
 *         schema:
 *           type: string
 *         description: ID du contrôleur (facultatif)
 *     responses:
 *       200:
 *         description: Données récupérées avec succès
 */
router.get('/dashboard', ReadingController.getLatestDashboard);
router.get('/history', ReadingController.getHistory);
router.get('/status', ReadingController.getControllerStatus);
router.get('/actuators', ReadingController.getActuators);
router.get('/sensors', ReadingController.getSensors);
/**
 * @swagger
 * /readings/irrigation:
 *   post:
 *     summary: Commander une vanne (Ouvrir/Fermer)
 *     tags: [Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [open, close]
 *               componentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Commande envoyée
 */
router.post('/irrigation', ReadingController.toggleIrrigation);
router.post('/simulate', ReadingController.simulateHumidity); // 🧪 Test seuil auto
router.post('/components', ReadingController.createComponent);
router.put('/components/:id', ReadingController.updateComponent);
router.delete('/components/:id', ReadingController.deleteComponent);

// Paramètres
router.get('/settings', SettingController.getSettings);
router.put('/settings', SettingController.updateSettings);

module.exports = router;
