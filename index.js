const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const errorHandler = require('./middlewares/errorHandler');

// ── Routes ───────────────────────────────────────────────────────
const userRoutes = require('./routes/user.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);

// ── Gestion centralisée des erreurs (toujours en dernier) ────────
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────
sequelize.sync({ alter: true }).then(() => {
    console.log('Base de données synchronisée.');
    app.listen(3000, () => {
        console.log('Serveur Backend démarré sur http://localhost:3000');
    });
}).catch((err) => {
    console.error('Erreur de connexion à la base de données :', err);
});