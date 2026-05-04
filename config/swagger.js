const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Smart Orchard API',
      version: '1.0.0',
      description: 'Documentation de l\'API pour le projet Smart Orchard. Permet de gérer les capteurs, les actionneurs et l\'irrigation.',
      contact: {
        name: 'Oumar Sall',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Serveur de développement local',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js'], // Où chercher les annotations
};

const specs = swaggerJsdoc(options);

module.exports = specs;
