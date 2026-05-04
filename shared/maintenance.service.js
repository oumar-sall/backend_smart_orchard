const { Reading, ActivityLog } = require('../models');
const { Op } = require('sequelize');
const logger = require('./logger');

const MaintenanceService = {
    /**
     * Purges old data based on retention policy
     */
    async purgeOldData() {
        try {
            logger.info('[Maintenance] 🧹 Starting data purge...');

            // 1. Purge Readings (Older than 45 days / 1.5 months)
            const readingsThreshold = new Date();
            readingsThreshold.setDate(readingsThreshold.getDate() - 45);
            
            const deletedReadings = await Reading.destroy({
                where: {
                    created_at: { [Op.lt]: readingsThreshold }
                }
            });

            // 2. Purge ActivityLogs (Older than 90 days / 3 months)
            const logsThreshold = new Date();
            logsThreshold.setDate(logsThreshold.getDate() - 90);

            const deletedLogs = await ActivityLog.destroy({
                where: {
                    created_at: { [Op.lt]: logsThreshold }
                }
            });

            if (deletedReadings > 0 || deletedLogs > 0) {
                logger.info(`[Maintenance] ✨ Purge complete: ${deletedReadings} readings and ${deletedLogs} logs removed.`);
                
                // Optionnel: VACUUM pour récupérer l'espace disque sur SQLite
                // await sequelize.query('VACUUM'); 
            } else {
                logger.info('[Maintenance] ✅ No old data to purge.');
            }
        } catch (err) {
            logger.error(`[Maintenance] ❌ Error during data purge: ${err.message}`);
        }
    }
};

module.exports = MaintenanceService;
