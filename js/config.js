/**
 * TicketFlow — Configuration globale
 *
 * Détection automatique :
 *  - localhost / 127.0.0.1  → API Node.js  http://localhost:3001/api
 *  - Tout autre domaine     → API PHP       /api  (même domaine, hébergement mutualisé)
 */

const TF_CONFIG = (() => {
  const { protocol, hostname } = window.location;

  let apiUrl;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Développement local — Node.js
    apiUrl = 'http://localhost:3001/api';
  } else {
    // Production lordhosting (hébergement mutualisé PHP)
    // Le dossier /api/ est au même niveau que index.html
    apiUrl = protocol + '//' + hostname + '/api';
  }

  return {
    API_URL  : apiUrl,
    APP_NAME : 'TicketFlow',
    VERSION  : '2.0.0',
  };
})();
