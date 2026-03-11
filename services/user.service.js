const { User } = require('../models');
const UserMapper = require('../mappers/user.mapper');
const { NotFoundError } = require('../middlewares/errors');

const UserService = {
    /**
     * Retourne tous les utilisateurs
     * @returns {UserDto[]}
     */
    async findAll() {
        const users = await User.findAll();
        return UserMapper.toDtoList(users);
    },

    /**
     * Retourne un utilisateur par son id
     * @param {string} id
     * @returns {UserDto}
     */
    async findById(id) {
        const user = await User.findByPk(id);
        if (!user) throw new NotFoundError(`Utilisateur ${id} introuvable`);
        return UserMapper.toDto(user);
    },

    /**
     * Crée un nouvel utilisateur
     * @param {{ email, password, phone, first_name, last_name }} data
     * @returns {UserDto}
     */
    async create(data) {
        const user = await User.create(data);
        return UserMapper.toDto(user);
    },

    /**
     * Met à jour un utilisateur
     * @param {string} id
     * @param {Object} data
     * @returns {UserDto}
     */
    async update(id, data) {
        const user = await User.findByPk(id);
        if (!user) throw new NotFoundError(`Utilisateur ${id} introuvable`);
        await user.update(data);
        return UserMapper.toDto(user);
    },

    /**
     * Supprime un utilisateur
     * @param {string} id
     */
    async remove(id) {
        const user = await User.findByPk(id);
        if (!user) throw new NotFoundError(`Utilisateur ${id} introuvable`);
        await user.destroy();
    },
};

module.exports = UserService;
