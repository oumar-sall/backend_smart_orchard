/**
 * DTO User — ce qu'on expose à l'API (jamais le mot de passe !)
 */
class UserDto {
    constructor({ id, email, phone, first_name, last_name }) {
        this.id         = id;
        this.email      = email;
        this.phone      = phone;
        this.first_name = first_name;
        this.last_name  = last_name;
    }
}

module.exports = UserDto;
