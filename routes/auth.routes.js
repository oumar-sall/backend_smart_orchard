const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Se connecter ou créer un compte
 *     description: Envoie un token JWT si l'utilisateur existe ou en crée un nouveau.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "0601020304"
 *     responses:
 *       200:
 *         description: Connexion réussie
 *       400:
 *         description: Numéro de téléphone manquant
 *       500:
 *         description: Erreur serveur
 */
router.post('/login', AuthController.login);
router.post('/verify-otp', AuthController.verifyOTP);
router.put('/update-profile', authenticateToken, AuthController.updateProfile);
router.delete('/delete-account', authenticateToken, AuthController.deleteAccount);

module.exports = router;
