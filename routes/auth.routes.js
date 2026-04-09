const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');

router.post('/login', AuthController.login);
router.post('/verify-otp', AuthController.verifyOTP);
router.put('/update-profile', authenticateToken, AuthController.updateProfile);
router.delete('/delete-account', authenticateToken, AuthController.deleteAccount);

module.exports = router;
