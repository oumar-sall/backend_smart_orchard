const { Controller, User, Access } = require('../models');
const logger = require('../shared/logger');

const joinOtpStore = new Map(); // Store OTPs for joining: IMEI_UserID -> { otp, expires }

const ControllerController = {
    async getAll(req, res, next) {
        try {
            // Uniquement les contrôleurs auxquels l'utilisateur a accès
            const user = await User.findByPk(req.user.id, {
                include: [{
                    model: Controller,
                    through: { attributes: [] } 
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
            const { name, imei: rawImei, join_otp } = req.body;
            const imei = rawImei?.trim();
            if (!name || !imei) {
                return res.status(400).json({ error: 'Nom et IMEI requis' });
            }

            // 1. Toujours vérifier le PIN dynamique (OTP SMS)
            const stored = joinOtpStore.get(`${imei}_${req.user.id}`);
            if (!stored || stored.otp !== join_otp) {
                return res.status(403).json({ error: 'Code SMS invalide ou expiré' });
            }
            if (stored.expires < Date.now()) {
                joinOtpStore.delete(`${imei}_${req.user.id}`);
                return res.status(403).json({ error: 'Code SMS expiré' });
            }

            // Vérifier si le contrôleur existe déjà
            let controller = await Controller.findOne({ where: { imei } });

            if (controller) {
                // --- LOGIQUE DE REJOINDRE (EXISTANT) ---
                




                // Vérifier si l'accès existe déjà
                const existingAccess = await Access.findOne({
                    where: { user_id: req.user.id, controller_id: controller.id }
                });

                if (existingAccess) {
                    return res.status(400).json({ error: 'Vous avez déjà accès à ce contrôleur' });
                }

                // Nettoyage de l'OTP
            joinOtpStore.delete(`${imei}_${req.user.id}`);

            } else {
                // --- LOGIQUE DE CRÉATION (NOUVEAU) ---
                controller = await Controller.create({ 
                    name, 
                    imei
                });
                logger.info(`[DB] Nouveau contrôleur créé : ${name} (${imei}) par ${req.user.phone}`);
            }

            // Créer le lien d'accès (propriétaire ou membre)
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
            const { name } = req.body;
            const controller = await Controller.findByPk(req.params.id);
            if (!controller) {
                return res.status(404).json({ error: 'Contrôleur non trouvé' });
            }

            const updateData = { name };
            await controller.update(updateData);
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
            // Ici, on pourrait aussi restreindre la suppression au proprio
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

            const smsService = require('../shared/sms');
            const { clients } = require('../shared/tcpServer');

            // 1. Chercher en base de données
            let controller = await Controller.findOne({ 
                where: { imei },
                attributes: ['id', 'name', 'imei'] 
            });
            
            let isNew = false;
            if (!controller) {
                // 2. Si pas en base, vérifier s'il est connecté au serveur TCP
                if (clients.has(imei)) {
                    isNew = true;
                    // On crée un objet "virtuel" pour le frontend
                    controller = {
                        name: 'Nouveau boîtier détecté',
                        imei: imei,
                        is_new: true
                    };
                } else {
                    return res.status(404).json({ error: 'Boîtier introuvable ou hors ligne. Assurez-vous qu\'il est allumé.' });
                }
            }

            // --- TRIGGER SMS OTP (Nouveau ou Existant) ---

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            // TTL 5 minutes
            joinOtpStore.set(`${imei}_${req.user.id}`, { otp, expires: Date.now() + 5 * 60 * 1000 });

            const sent = smsService.sendSms(req.user.phone, `Code de verification Smart Orchard pour ${controller.name || 'votre boitier'} : ${otp}`);


            res.json({ 
                ...(controller.toJSON ? controller.toJSON() : controller), 
                sms_sent: sent,
                debug_otp: sent ? undefined : otp, // Pour test au cas où pas de boîtier
                is_new: isNew
            });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ControllerController;
