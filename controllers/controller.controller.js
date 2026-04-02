const { Controller, Component, Reading, Setting, ActivityLog, Access, User } = require('../models');
const logger = require('../shared/logger');

const ControllerController = {
    async getAll(req, res, next) {
        try {
            // Uniquement les contrôleurs auxquels l'utilisateur a accès
            const user = await User.findByPk(req.user.id, {
                include: [{
                    model: Controller,
                    through: { attributes: [] } // On ne veut pas les stats de la table Pivot
                }]
            });
            res.json(user.Controllers || []);
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const controller = await Controller.findByPk(req.params.id);
            if (!controller) {
                return res.status(404).json({ error: 'Contrôleur non trouvé' });
            }
            res.json(controller);
        } catch (err) {
            next(err);
        }
    },

    async create(req, res, next) {
        try {
            const { name, imei: rawImei, security_pin } = req.body;
            const imei = rawImei?.trim();
            if (!name || !imei || !security_pin) {
                return res.status(400).json({ error: 'Nom, IMEI et PIN de sécurité requis' });
            }

            // Vérifier si le contrôleur existe déjà
            let controller = await Controller.findOne({ where: { imei } });

            if (controller) {
                // Si le contrôleur existe, on vérifie le PIN pour l'associer à ce nouvel utilisateur
                if (controller.security_pin !== security_pin) {
                    return res.status(403).json({ error: 'PIN de sécurité incorrect pour ce boîtier' });
                }

                // Vérifier si l'accès existe déjà
                const existingAccess = await Access.findOne({
                    where: { user_id: req.user.id, controller_id: controller.id }
                });

                if (existingAccess) {
                    return res.status(400).json({ error: 'Vous avez déjà accès à ce contrôleur' });
                }
            } else {
                // Si c'est un nouveau contrôleur, on le crée
                // Note: Dans un vrai flux, on pourrait vouloir valider que l'IMEI est valide avant.
                // Ici, le premier qui l'ajoute définit le PIN (ou utilise le PIN par défaut).
                controller = await Controller.create({ 
                    name, 
                    imei, 
                    security_pin: security_pin // On utilise le PIN fourni comme PIN initial
                });
                logger.info(`[DB] Nouveau contrôleur créé : ${name} (${imei})`);
            }

            // Créer le lien d'accès
            await Access.create({
                user_id: req.user.id,
                controller_id: controller.id
            });

            logger.info(`[AUTH] Accès accordé à l'utilisateur ${req.user.phone} pour le contrôleur ${imei}`);

            res.status(201).json(controller);
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const { name, imei } = req.body;
            const controller = await Controller.findByPk(req.params.id);
            if (!controller) {
                return res.status(404).json({ error: 'Contrôleur non trouvé' });
            }
            await controller.update({ name, imei });
            res.json(controller);
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({ error: 'Cet IMEI est déjà utilisé' });
            }
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            const controller = await Controller.findByPk(req.params.id);
            if (!controller) {
                return res.status(404).json({ error: 'Contrôleur non trouvé' });
            }
            await controller.destroy();
            res.json({ success: true, message: 'Contrôleur supprimé avec succès' });
        } catch (err) {
            next(err);
        }
    },

    async searchByImei(req, res, next) {
        try {
            const { imei: rawImei } = req.query;
            const imei = rawImei?.trim();
            if (!imei) {
                return res.status(400).json({ error: 'IMEI requis' });
            }
            const controller = await Controller.findOne({ 
                where: { imei },
                attributes: ['id', 'name', 'imei'] // Pas de security_pin ici
            });
            
            if (!controller) {
                return res.status(404).json({ error: 'Aucun contrôleur trouvé avec cet IMEI' });
            }
            
            res.json(controller);
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ControllerController;
