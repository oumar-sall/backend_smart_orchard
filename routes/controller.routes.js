const { Router } = require('express');
const ControllerController = require('../controllers/controller.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authenticateToken, ControllerController.getAll);
router.get('/:id', authenticateToken, ControllerController.getById);
router.post('/', authenticateToken, ControllerController.create);
router.put('/:id', authenticateToken, ControllerController.update);
router.delete('/:id', authenticateToken, ControllerController.delete);

module.exports = router;
