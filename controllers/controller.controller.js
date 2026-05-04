const { Controller, User, Access } = require('../models');
const logger = require('../shared/logger');

// In-memory OTP store for join flow: `${imei}_${userId}` -> { otp, expires, lastSentAt, lastSentSuccess }
const joinOtpStore = new Map();

const ControllerController = {
    async getAll(req, res, next) {
        try {
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

            const stored = joinOtpStore.get(`${imei}_${req.user.id}`);
            if (!stored || stored.otp !== join_otp) {
                return res.status(403).json({ error: 'Code SMS invalide ou expiré' });
            }
            if (stored.expires < Date.now()) {
                joinOtpStore.delete(`${imei}_${req.user.id}`);
                return res.status(403).json({ error: 'Code SMS expiré' });
            }

            let controller = await Controller.findOne({ where: { imei } });

            if (controller) {
                const existingAccess = await Access.findOne({
                    where: { user_id: req.user.id, controller_id: controller.id }
                });

                if (existingAccess) {
                    return res.status(400).json({ error: 'Vous avez déjà accès à ce contrôleur' });
                }

                joinOtpStore.delete(`${imei}_${req.user.id}`);

            } else {
                controller = await Controller.create({ name, imei });
                logger.info(`[DB] New controller created: ${name} (${imei}) by ${req.user.phone}`);
            }

            await Access.create({
                user_id: req.user.id,
                controller_id: controller.id
            });

            logger.info(`[AUTH] Access granted to ${req.user.phone} for controller ${imei}`);

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
                if (clients.has(imei)) {
                    isNew = true;
                    controller = {
                        name: 'Nouveau boîtier détecté',
                        imei: imei,
                        is_new: true
                    };
                } else {
                    return res.status(404).json({ error: 'Boîtier introuvable ou hors ligne. Assurez-vous qu\'il est allumé.' });
                }
            }

            const storeKey = `${imei}_${req.user.id}`;
            const existing = joinOtpStore.get(storeKey);

            let otp;
            let smsSent = false;
            let shouldSendSms = true;

            if (existing && existing.expires > Date.now()) {
                otp = existing.otp;
                if (existing.lastSentAt && (Date.now() - existing.lastSentAt < 30000)) {
                    shouldSendSms = false;
                    smsSent = existing.lastSentSuccess;
                }
            } else {
                otp = Math.floor(100000 + Math.random() * 900000).toString();
            }

            if (shouldSendSms) {
                smsSent = smsService.sendSms(req.user.phone, `Code de verification Smart Orchard pour ${controller.name || 'votre boitier'} : ${otp}`);
                joinOtpStore.set(storeKey, {
                    otp,
                    expires: Date.now() + 5 * 60 * 1000,
                    lastSentAt: Date.now(),
                    lastSentSuccess: smsSent
                });
            }

            res.json({
                ...(controller.toJSON ? controller.toJSON() : controller),
                sms_sent: smsSent,
                debug_otp: smsSent ? undefined : otp,
                is_new: isNew
            });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ControllerController;
