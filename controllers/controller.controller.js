const { Controller, Component, Reading, Setting, ActivityLog } = require('../models');

const ControllerController = {
    async getAll(req, res, next) {
        try {
            const controllers = await Controller.findAll();
            res.json(controllers);
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
            const { name, imei } = req.body;
            if (!name || !imei) {
                return res.status(400).json({ error: 'Nom et IMEI requis' });
            }
            const controller = await Controller.create({ name, imei });
            res.status(201).json(controller);
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({ error: 'Cet IMEI est déjà utilisé' });
            }
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
            // Cascade delete handled by Sequelize associations with onDelete: 'CASCADE'
            await controller.destroy();
            res.json({ success: true, message: 'Contrôleur supprimé avec succès' });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ControllerController;
