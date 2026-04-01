const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

/**
 * @route POST /auth/send-otp
 * @desc Générer et "envoyer" un code OTP (affichage console)
 */
router.post('/send-otp', AuthController.sendOTP);

/**
 * @route POST /auth/verify-otp
 * @desc Vérifier l'OTP et retourner un JWT
 */
router.post('/verify-otp', AuthController.verifyOTP);

module.exports = router;
