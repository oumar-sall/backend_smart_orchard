const { ActivityLog, Controller } = require('../models');
const { Op } = require('sequelize');

const ActivityLogController = {
    async getActivityLogs(req, res, next) {
        try {
            const { controller_id, period, page = 1, limit = 10 } = req.query;
            const where = {};
            
            if (controller_id) {
                where.controller_id = controller_id;
            }

            if (period) {
                const daysToFetch = period === 'month' ? 30 : 7;
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysToFetch);
                startDate.setHours(0, 0, 0, 0);
                where.timestamp = { [Op.gte]: startDate };
            }

            const offset = (page - 1) * limit;

            const { count, rows } = await ActivityLog.findAndCountAll({
                where,
                order: [['timestamp', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset),
                include: [{
                    model: Controller,
                    attributes: ['name']
                }]
            });

            res.json({
                totalItems: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                logs: rows
            });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ActivityLogController;
