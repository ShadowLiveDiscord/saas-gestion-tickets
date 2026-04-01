/**
 * TicketFlow — Système de Feature Flags
 * Permet d'activer / désactiver des modules depuis le panel admin.
 * Les réglages sont stockés dans localStorage sous la clé "tf_features".
 */

const TF_FEATURES_KEY = 'tf_features';

const DEFAULT_FEATURES = {
  landing:          { label: 'Page d\'accueil',           desc: 'Landing page publique avec présentation du produit', enabled: true },
  register:         { label: 'Inscription',               desc: 'Formulaire de création de compte utilisateur',       enabled: true },
  dashboard_user:   { label: 'Espace utilisateur',        desc: 'Dashboard de soumission et suivi des tickets',       enabled: true },
  dashboard_agent:  { label: 'Espace agent',              desc: 'Dashboard de traitement des tickets pour les agents', enabled: false },
  dashboard_admin:  { label: 'Panel administrateur',      desc: 'Console d\'administration complète',                 enabled: false },
  messaging:        { label: 'Messagerie sur ticket',     desc: 'Fil de messages entre utilisateur et agent',         enabled: false },
  pricing:          { label: 'Section tarifs',            desc: 'Page d\'accueil — section des offres tarifaires',    enabled: true },
};

function getFeatures() {
  try {
    const stored = localStorage.getItem(TF_FEATURES_KEY);
    if (!stored) return DEFAULT_FEATURES;
    const parsed = JSON.parse(stored);
    // Fusionner avec les défauts pour les nouvelles clés
    return Object.assign({}, DEFAULT_FEATURES, parsed);
  } catch {
    return DEFAULT_FEATURES;
  }
}

function saveFeatures(features) {
  localStorage.setItem(TF_FEATURES_KEY, JSON.stringify(features));
}

function isEnabled(key) {
  const f = getFeatures();
  return f[key] ? f[key].enabled : false;
}

/**
 * Redirige vers la page "non disponible" si la feature est désactivée.
 * À appeler en haut de chaque page protégée.
 */
function requireFeature(key) {
  if (!isEnabled(key)) {
    const base = window.location.pathname.includes('/pages/') ? '../' : '';
    window.location.href = base + 'pages/unavailable.html?feature=' + key;
  }
}
