const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../shared/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-orchard-secret-key-2024';

// In-memory OTP store: phone -> code
const otpStore = new Map();

const AuthController = {
    async login(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Numero de telephone requis' });
            }

            const [user, created] = await User.findOrCreate({
                where: { phone },
                defaults: {
                    first_name: 'Nouveau',
                    last_name: 'Utilisateur'
                }
            });

            if (created) {
                logger.info(`[AUTH] New user created for ${phone}`);
            }

            const token = jwt.sign(
                { id: user.id, phone: user.phone },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            logger.info(`[AUTH] Login successful for ${phone}`);

            return res.json({
                message: created ? 'Compte cree et connecte' : 'Connexion reussie',
                token,
                user: {
                    id: user.id,
                    phone: user.phone,
                    first_name: user.first_name,
                    last_name: user.last_name
                },
                alreadyRegistered: !created
            });

        } catch (err) {
            logger.error('[AUTH] Login error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

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

            otpStore.delete(phone);

            let user = await User.findOne({ where: { phone } });
            let isNewUser = false;

            if (!user) {
                isNewUser = true;
                user = await User.create({
                    phone,
                    first_name: 'Nouveau',
                    last_name: 'Utilisateur'
                });
            }

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
            logger.error('[AUTH] OTP verification error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

    async updateProfile(req, res) {
        try {
            const { first_name, last_name } = req.body;
            if (!first_name || !last_name) {
                return res.status(400).json({ error: 'Nom et prénom requis' });
            }

            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            await user.update({ first_name, last_name });

            res.json({
                message: 'Profil mis à jour',
                user: {
                    id: user.id,
                    phone: user.phone,
                    first_name: user.first_name,
                    last_name: user.last_name
                }
            });
        } catch (err) {
            logger.error('[AUTH] Profile update error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

    async deleteAccount(req, res) {
        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            await user.destroy();
            res.json({ message: 'Compte supprimé avec succès' });
        } catch (err) {
            logger.error('[AUTH] Account deletion error:', err);
            res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
        }
    }
};

module.exports = AuthController;
