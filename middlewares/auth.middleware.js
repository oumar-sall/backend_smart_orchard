const jwt = require('jsonwebtoken');
const { User, Access } = require('../models');
const logger = require('../shared/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-orchard-secret-key-2024';

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findByPk(decoded.id);

        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        req.user = user;
        next();
    } catch (err) {
        logger.error('Erreur authentification token:', err);
        return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
};

/**
 * Middleware optionnel pour vérifier si l'utilisateur a accès à un contrôleur spécifique.
 * Utilisation : router.get('/:controllerId', authenticateToken, checkControllerAccess, ...)
 */
const checkControllerAccess = async (req, res, next) => {
    const controllerId = req.params.controllerId || req.body.controller_id;

    if (!controllerId) {
        return next(); // Pas d'ID de contrôleur à vérifier
    }

    try {
        const access = await Access.findOne({
            where: {
                user_id: req.user.id,
                controller_id: controllerId
            }
        });

        if (!access) {
            return res.status(403).json({ error: 'Accès refusé à ce contrôleur' });
        }

        next();
    } catch (err) {
        logger.error('Erreur vérification accès contrôleur:', err);
        res.status(500).json({ error: 'Erreur serveur lors de la vérification des accès' });
    }
};

module.exports = {
    authenticateToken,
    checkControllerAccess
};
