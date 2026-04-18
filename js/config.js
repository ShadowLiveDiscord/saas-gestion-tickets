/**
 * TicketFlow — Configuration globale
 *
 * Ce fichier est le seul endroit où configurer l'URL de l'API.
 * En développement local : node server.js sur le port 3001
 * En production (lordhosting) : même domaine, port 3001
 *                               OU reverse proxy sur /api
 */

const TF_CONFIG = (() => {
  const { protocol, hostname, port } = window.location;

  // ── Détection automatique de l'URL de l'API ──────────────
  // Si le frontend est sur monsite.fr, l'API sera sur monsite.fr:3001
  // Si le frontend est sur localhost, l'API sera sur localhost:3001
  let apiUrl;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Développement local
    apiUrl = 'http://localhost:3001/api';
  } else {
    // Production : même hôte, port 3001
    // Si vous avez un reverse proxy (nginx/apache) qui redirige /api → :3001,
    // remplacez par : apiUrl = protocol + '//' + hostname + '/api';
    apiUrl = protocol + '//' + hostname + ':3001/api';
  }

  return {
    API_URL     : apiUrl,
    APP_NAME    : 'TicketFlow',
    VERSION     : '2.0.0',
  };
})();
