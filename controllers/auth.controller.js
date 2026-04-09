const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../shared/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-orchard-secret-key-2024';

// Simuler un stockage d'OTP en mémoire (Numéro -> Code)
const otpStore = new Map();

const AuthController = {
    /**
     * @desc Connexion instantanee (V1 sans OTP pour le login de base)
     */
    async login(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Numero de telephone requis' });
            }

            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'smart-orchard-secret-key-2024';

            // On cherche ou on crée l'utilisateur directement (Connexion Instantanée V1)
            let [user, created] = await User.findOrCreate({ 
                where: { phone },
                defaults: {
                    first_name: 'Nouveau',
                    last_name: 'Utilisateur'
                }
            });

            if (created) {
                logger.info(`[AUTH] ✨ Nouvel utilisateur cree pour ${phone}`);
            }

            // Génération du token JWT immédiat
            const token = jwt.sign(
                { id: user.id, phone: user.phone },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            logger.info(`[AUTH] 📱 Connexion instantanee pour ${phone}`);

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
            logger.error('Erreur login instantane:', err);
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
    },

    /**
     * @desc Mettre à jour le profil (Nom/Prénom)
     */
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
            logger.error('Erreur updateProfile:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

    /**
     * @desc Supprimer le compte utilisateur
     */
    async deleteAccount(req, res) {
        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            // Supprimer l'utilisateur (CASCADE supprimera ses entrées Access et ActivityLog si lié)
            await user.destroy();
            res.json({ message: 'Compte supprimé avec succès' });
        } catch (err) {
            console.error('ERREUR CRITIQUE deleteAccount:', err); // Log plus visible
            logger.error('Erreur deleteAccount detail:', err);
            res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
        }
    }
};

module.exports = AuthController;
