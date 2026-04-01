/**
 * TicketFlow — Système de Feature Flags
 * Chaque module peut être activé / désactivé depuis le panel admin.
 * Les réglages sont persistés dans localStorage.
 */

const TF_FEATURES_KEY = 'tf_features';

/**
 * Définition de tous les modules du site.
 * group   : catégorie d'affichage dans le panel admin
 * label   : nom affiché
 * desc    : description courte
 * enabled : état par défaut
 * protect : si true, requireFeature() redirige si désactivé
 */
const DEFAULT_FEATURES = {

  /* ── PAGES PUBLIQUES ── */
  landing: {
    group: 'Pages publiques',
    label: 'Page d\'accueil',
    desc: 'Landing page avec présentation, fonctionnalités et tarifs.',
    enabled: true, protect: false
  },
  register: {
    group: 'Pages publiques',
    label: 'Inscription',
    desc: 'Formulaire de création de compte utilisateur.',
    enabled: true, protect: true
  },
  login: {
    group: 'Pages publiques',
    label: 'Connexion',
    desc: 'Page de connexion (désactiver bloque tout accès).',
    enabled: true, protect: true
  },
  pricing: {
    group: 'Pages publiques',
    label: 'Section tarifs',
    desc: 'Section tarifaire sur la page d\'accueil.',
    enabled: true, protect: false
  },
  how_it_works: {
    group: 'Pages publiques',
    label: 'Section "Comment ça marche"',
    desc: 'Explication des 3 étapes sur la page d\'accueil.',
    enabled: true, protect: false
  },

  /* ── ESPACE UTILISATEUR ── */
  dashboard_user: {
    group: 'Espace utilisateur',
    label: 'Dashboard utilisateur',
    desc: 'Accès au tableau de bord de soumission de tickets.',
    enabled: true, protect: true
  },
  user_create_ticket: {
    group: 'Espace utilisateur',
    label: 'Créer un ticket',
    desc: 'Bouton et formulaire de création de ticket.',
    enabled: true, protect: false
  },
  user_filters: {
    group: 'Espace utilisateur',
    label: 'Filtres et recherche',
    desc: 'Filtres par statut, priorité et barre de recherche.',
    enabled: true, protect: false
  },
  user_messaging: {
    group: 'Espace utilisateur',
    label: 'Messagerie utilisateur',
    desc: 'Fil de messages sur chaque ticket côté utilisateur.',
    enabled: false, protect: false
  },
  user_profile: {
    group: 'Espace utilisateur',
    label: 'Profil utilisateur',
    desc: 'Page de modification du profil et des informations personnelles.',
    enabled: true, protect: false
  },

  /* ── ESPACE AGENT ── */
  dashboard_agent: {
    group: 'Espace agent',
    label: 'Dashboard agent',
    desc: 'Accès au tableau de bord de traitement des tickets.',
    enabled: false, protect: true
  },
  agent_reply: {
    group: 'Espace agent',
    label: 'Réponse agent',
    desc: 'Possibilité pour l\'agent de répondre aux tickets.',
    enabled: false, protect: false
  },
  agent_change_status: {
    group: 'Espace agent',
    label: 'Changement de statut',
    desc: 'L\'agent peut modifier le statut d\'un ticket.',
    enabled: false, protect: false
  },
  agent_change_priority: {
    group: 'Espace agent',
    label: 'Changement de priorité',
    desc: 'L\'agent peut modifier la priorité d\'un ticket.',
    enabled: false, protect: false
  },
  agent_my_tickets: {
    group: 'Espace agent',
    label: 'Mes tickets assignés',
    desc: 'Onglet affichant uniquement les tickets de l\'agent.',
    enabled: false, protect: false
  },

  /* ── PANEL ADMIN ── */
  dashboard_admin: {
    group: 'Panel administrateur',
    label: 'Panel administrateur',
    desc: 'Accès à la console d\'administration complète.',
    enabled: true, protect: true
  },
  admin_tickets: {
    group: 'Panel administrateur',
    label: 'Gestion des tickets (admin)',
    desc: 'Section de visualisation et gestion de tous les tickets.',
    enabled: true, protect: false
  },
  admin_users: {
    group: 'Panel administrateur',
    label: 'Gestion des utilisateurs',
    desc: 'Section de création et modification des comptes utilisateurs.',
    enabled: true, protect: false
  },
  admin_agents: {
    group: 'Panel administrateur',
    label: 'Gestion des agents',
    desc: 'Section de création et gestion des comptes agents.',
    enabled: true, protect: false
  },
  admin_stats: {
    group: 'Panel administrateur',
    label: 'Statistiques (admin)',
    desc: 'Graphiques de répartition par statut et priorité.',
    enabled: true, protect: false
  },
  admin_settings: {
    group: 'Panel administrateur',
    label: 'Paramètres système',
    desc: 'Configuration générale et notifications de la plateforme.',
    enabled: true, protect: false
  },
};

/* ═══════════════════════════════════════════
   FONCTIONS UTILITAIRES
═══════════════════════════════════════════ */

function getFeatures() {
  try {
    const stored = localStorage.getItem(TF_FEATURES_KEY);
    if (!stored) return JSON.parse(JSON.stringify(DEFAULT_FEATURES));
    const parsed = JSON.parse(stored);
    // Fusionner pour ne pas perdre les nouvelles clés
    const merged = JSON.parse(JSON.stringify(DEFAULT_FEATURES));
    Object.keys(parsed).forEach(k => {
      if (merged[k]) merged[k].enabled = parsed[k].enabled;
    });
    return merged;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_FEATURES));
  }
}

function saveFeatures(features) {
  // Ne sauvegarder que l'état enabled pour chaque clé
  const toSave = {};
  Object.keys(features).forEach(k => { toSave[k] = { enabled: features[k].enabled }; });
  localStorage.setItem(TF_FEATURES_KEY, JSON.stringify(toSave));
}

function isEnabled(key) {
  const f = getFeatures();
  return f[key] ? f[key].enabled : true;
}

/**
 * Redirige vers la page "non disponible" si le module protect est désactivé.
 * À appeler en tête de chaque page protégée.
 */
function requireFeature(key) {
  if (!isEnabled(key)) {
    const base = window.location.pathname.includes('/pages/') ? '../' : '';
    window.location.href = base + 'pages/unavailable.html?feature=' + key;
  }
}

/**
 * Masque ou affiche un élément HTML selon l'état du module.
 * @param {string} key    - clé du module
 * @param {string} sel    - sélecteur CSS de l'élément à masquer
 * @param {string} [display] - valeur display quand actif (défaut : '')
 */
function applyFeature(key, sel, display) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.style.display = isEnabled(key) ? (display || '') : 'none';
}

/**
 * Retourne tous les modules groupés par catégorie.
 */
function getGroupedFeatures() {
  const features = getFeatures();
  const groups = {};
  Object.entries(features).forEach(([key, f]) => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push({ key, ...f });
  });
  return groups;
}
