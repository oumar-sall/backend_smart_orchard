const { Router } = require('express');
const UserController = require('../controllers/user.controller');

const router = Router();

router.get('/',     UserController.findAll);   // GET  /users
router.get('/:id',  UserController.findById);  // GET  /users/:id
router.post('/',    UserController.create);    // POST /users
router.put('/:id',  UserController.update);    // PUT  /users/:id
router.delete('/:id', UserController.remove);  // DELETE /users/:id

module.exports = router;
