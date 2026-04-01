const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../shared/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-orchard-secret-key-2024';

// Simuler un stockage d'OTP en mémoire (Numéro -> Code)
const otpStore = new Map();

const AuthController = {
    /**
     * @desc Générer et "envoyer" un code OTP (affichage console)
     */
    async sendOTP(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Numéro de téléphone requis' });
            }

            // Générer un code à 6 chiffres (fixe pour l'instant comme demandé, mais affiché)
            const otp = '123456'; 
            otpStore.set(phone, otp);

            logger.info(`[AUTH] 📱 Code OTP pour ${phone} : ${otp}`);

            res.json({ message: 'Code envoyé (voir console)' });
        } catch (err) {
            logger.error('Erreur send-otp:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

    /**
     * @desc Vérifier l'OTP et retourner un JWT
     */
    async verifyOTP(req, res) {
        try {
            const { phone, otp } = req.body;

            if (!phone || !otp) {
                return res.status(400).json({ error: 'Numéro et code requis' });
            }

            const validOtp = otpStore.get(phone);

            if (otp !== validOtp) {
                return res.status(401).json({ error: 'Code incorrect' });
            }

            // Supprimer l'OTP après usage
            otpStore.delete(phone);

            // Trouver ou créer l'utilisateur
            let user = await User.findOne({ where: { phone } });
            let isNewUser = false;

            if (!user) {
                isNewUser = true;
                // On crée un utilisateur minimal, il complétera son profil après
                user = await User.create({
                    phone,
                    password: 'temporary-password',
                    first_name: 'Nouveau',
                    last_name: 'Utilisateur'
                });
            }

            // Générer le JWT
            const token = jwt.sign(
                { id: user.id, phone: user.phone },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    phone: user.phone,
                    first_name: user.first_name,
                    last_name: user.last_name
                },
                isNewUser
            });

        } catch (err) {
            logger.error('Erreur verify-otp:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
};

module.exports = AuthController;
