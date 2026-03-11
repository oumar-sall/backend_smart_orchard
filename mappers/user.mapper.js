const UserDto = require('../dtos/user.dto');

const UserMapper = {
    /**
     * Convertit une instance Sequelize User en UserDto
     * @param {Object} user - instance Sequelize
     * @returns {UserDto}
     */
    toDto(user) {
        return new UserDto(user.toJSON());
    },

    /**
     * Convertit un tableau d'instances Sequelize en tableau de UserDto
     * @param {Object[]} users
     * @returns {UserDto[]}
     */
    toDtoList(users) {
        return users.map((u) => this.toDto(u));
    },
};

module.exports = UserMapper;
