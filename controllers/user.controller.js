const UserService = require('../services/user.service');

const UserController = {
    async findAll(req, res, next) {
        try {
            const users = await UserService.findAll();
            res.json(users);
        } catch (err) {
            next(err);
        }
    },

    async findById(req, res, next) {
        try {
            const user = await UserService.findById(req.params.id);
            res.json(user);
        } catch (err) {
            next(err);
        }
    },

    async create(req, res, next) {
        try {
            const user = await UserService.create(req.body);
            res.status(201).json(user);
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const user = await UserService.update(req.params.id, req.body);
            res.json(user);
        } catch (err) {
            next(err);
        }
    },

    async remove(req, res, next) {
        try {
            await UserService.remove(req.params.id);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },
};

module.exports = UserController;
