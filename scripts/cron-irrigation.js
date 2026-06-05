const axios = require('axios');
require('dotenv').config({ quiet: true });

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/readings/check-expired`;

async function run() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] 🕒 Déclenchement de la vérification des timers...`);
        const response = await axios.post(URL);
        console.log(`Succès : ${response.data.message}`);
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error("Erreur : Le serveur backend n'est pas lancé (Connexion refusée).");
        } else if (error.response) {
            console.error(`Erreur Serveur (${error.response.status}) :`, error.response.data.error || error.response.data);
        } else {
            console.error("Erreur lors du déclenchement :", error.message);
        }
        process.exit(1);
    }
}

run();
