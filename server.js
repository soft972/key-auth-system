const express = require('express');
const crypto = require('crypto');
const app = express();

// Récupération des variables cachées sur Railway (ou valeurs par défaut)
const PORT = process.env.PORT || 3000;
const API_SECRET_ROUTE = process.env.API_SECRET_ROUTE || "api_default_123";
const KEY_LIFETIME = parseInt(process.env.KEY_LIFETIME_MINUTES) || 60; // en minutes
const LINKVERTISE_URL = process.env.LINKVERTISE_URL || "https://linkvertise.com/ton_lien";
const SECRET_SALT = process.env.SECRET_SALT || "cle_secrete_anti_triche_super_longue";

// Base de données temporaire en mémoire pour stocker les clés et leurs expirations
const activeKeys = new Map();

// Fonction pour générer une clé totalement aléatoire de 24 caractères
function generateSecureKey() {
    return crypto.randomBytes(12).toString('hex');
}

// Fonction pour nettoyer les clés expirées toutes les 5 minutes
setInterval(() => {
    const now = Date.now();
    for (let [key, data] of activeKeys.entries()) {
        if (now > data.expiresAt) {
            activeKeys.delete(key);
        }
    }
}, 5 * 60 * 1000);

// --- ROUTE 1 : LA PAGE UNIQUE (Génération et affichage) ---
app.get('/', (req, res) => {
    const token = req.query.token;

    // Étape A : L'utilisateur revient de Linkvertise avec un jeton de validation
    if (token) {
        // Vérification de la signature pour s'assurer qu'il n'a pas inventé le jeton
        const expectedToken = crypto.createHash('sha256').update("valid_" + SECRET_SALT).digest('hex');
        
        if (token === expectedToken) {
            // Génération de la clé
            const newKey = generateSecureKey();
            const expiresAt = Date.now() + (KEY_LIFETIME * 60 * 1000);
            
            // Stockage de la clé
            activeKeys.set(newKey, { expiresAt: expiresAt });

            // Affichage de la clé sur la même page
            return res.send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 20%;">
                    <h2>Félicitations, voici ta clé :</h2>
                    <input type="text" value="${newKey}" readonly style="padding: 10px; width: 300px; font-size: 18px; text-align: center;">
                    <p>Cette clé est valide pendant ${KEY_LIFETIME} minutes.</p>
                </div>
            `);
        }
    }

    // Étape B : L'utilisateur arrive pour la première fois (pas de jeton)
    // On crée l'URL de retour (callback) que Linkvertise devra appeler à la fin
    const validToken = crypto.createHash('sha256').update("valid_" + SECRET_SALT).digest('hex');
    const returnUrl = `https://${req.get('host')}/?token=${validToken}`;
    
    // Dans la réalité, tu configures Linkvertise pour qu'il redirige vers 'returnUrl'
    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 20%;">
            <h2>Bienvenue sur le Key System</h2>
            <p>Tu dois passer une étape pour obtenir ta clé.</p>
            <a href="${LINKVERTISE_URL}" style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Obtenir la clé</a>
            <br><br>
            <p style="font-size: 12px; color: gray;">(Pour le test, configure Linkvertise pour rediriger vers : ${returnUrl})</p>
        </div>
    `);
});

// --- ROUTE 2 : L'API SECRÈTE POUR LE SCRIPT LUA ---
app.get(`/${API_SECRET_ROUTE}`, (req, res) => {
    const userKey = req.query.key;
    const now = Date.now();

    if (!userKey || !activeKeys.has(userKey)) {
        return res.json({ valid: false, message: "Clé invalide ou inexistante." });
    }

    const keyData = activeKeys.get(userKey);

    if (now > keyData.expiresAt) {
        activeKeys.delete(userKey); // Suppression immédiate si expirée
        return res.json({ valid: false, message: "Clé expirée." });
    }

    // La clé est bonne ! On renvoie l'autorisation.
    const timeRemaining = Math.floor((keyData.expiresAt - now) / 60000);
    return res.json({ 
        valid: true, 
        message: "Clé autorisée", 
        minutes_remaining: timeRemaining 
    });
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
