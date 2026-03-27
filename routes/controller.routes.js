const { Router } = require('express');
const ControllerController = require('../controllers/controller.controller');

const router = Router();

router.get('/', ControllerController.getAll);
router.get('/:id', ControllerController.getById);
router.post('/', ControllerController.create);
router.put('/:id', ControllerController.update);
router.delete('/:id', ControllerController.delete);

module.exports = router;
