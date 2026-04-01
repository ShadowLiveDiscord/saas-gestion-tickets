/**
 * TicketFlow — Système de Feature Flags
 * Stockage : localStorage['tf_features'] = { key: true/false, ... }
 * La définition complète (label, desc, group) reste dans le code.
 */

const TF_FEATURES_KEY = 'tf_features';

/* Définition de référence — jamais modifiée en runtime */
const FEATURES_DEF = [
  /* ── Pages publiques ── */
  { key: 'landing',        group: 'Pages publiques',       label: 'Page d\'accueil',               desc: 'Landing page avec présentation, fonctionnalités et tarifs.',            defaultOn: true,  protect: false },
  { key: 'register',       group: 'Pages publiques',       label: 'Inscription',                   desc: 'Formulaire de création de compte utilisateur.',                         defaultOn: true,  protect: true  },
  { key: 'login',          group: 'Pages publiques',       label: 'Connexion',                     desc: 'Page de connexion (désactiver bloque tout accès).',                     defaultOn: true,  protect: true  },
  { key: 'pricing',        group: 'Pages publiques',       label: 'Section Tarifs',                desc: 'Section tarifaire sur la page d\'accueil.',                             defaultOn: true,  protect: false },
  { key: 'how_it_works',   group: 'Pages publiques',       label: 'Section "Comment ça marche"',   desc: 'Bloc explicatif en 3 étapes sur la page d\'accueil.',                   defaultOn: true,  protect: false },

  /* ── Espace utilisateur ── */
  { key: 'dashboard_user',   group: 'Espace utilisateur',  label: 'Dashboard utilisateur',         desc: 'Accès au tableau de bord de soumission et suivi des tickets.',          defaultOn: true,  protect: true  },
  { key: 'user_create_ticket',group:'Espace utilisateur',  label: 'Créer un ticket',               desc: 'Bouton et formulaire de création de nouveau ticket.',                   defaultOn: true,  protect: false },
  { key: 'user_filters',     group: 'Espace utilisateur',  label: 'Filtres et recherche',          desc: 'Barre de recherche et filtres par statut / priorité.',                  defaultOn: true,  protect: false },
  { key: 'user_messaging',   group: 'Espace utilisateur',  label: 'Messagerie (utilisateur)',      desc: 'Fil de messages sur chaque ticket côté utilisateur.',                   defaultOn: false, protect: false },
  { key: 'user_profile',     group: 'Espace utilisateur',  label: 'Profil utilisateur',            desc: 'Page de modification du profil et des informations personnelles.',      defaultOn: true,  protect: false },

  /* ── Espace agent ── */
  { key: 'dashboard_agent',      group: 'Espace agent',    label: 'Dashboard agent',               desc: 'Accès au tableau de bord de traitement des tickets.',                   defaultOn: false, protect: true  },
  { key: 'agent_reply',          group: 'Espace agent',    label: 'Répondre à un ticket',          desc: 'Zone de réponse dans la fiche ticket côté agent.',                      defaultOn: false, protect: false },
  { key: 'agent_change_status',  group: 'Espace agent',    label: 'Changer le statut',             desc: 'L\'agent peut modifier le statut d\'un ticket.',                       defaultOn: false, protect: false },
  { key: 'agent_change_priority',group: 'Espace agent',    label: 'Changer la priorité',           desc: 'L\'agent peut modifier la priorité d\'un ticket.',                     defaultOn: false, protect: false },
  { key: 'agent_my_tickets',     group: 'Espace agent',    label: 'Onglet "Mes tickets"',          desc: 'Onglet listant uniquement les tickets assignés à l\'agent.',            defaultOn: false, protect: false },

  /* ── Panel admin ── */
  { key: 'dashboard_admin',  group: 'Panel administrateur', label: 'Panel administrateur',         desc: 'Accès à la console d\'administration complète.',                        defaultOn: true,  protect: true  },
  { key: 'admin_tickets',    group: 'Panel administrateur', label: 'Gestion des tickets',          desc: 'Section de visualisation et gestion de tous les tickets.',              defaultOn: true,  protect: false },
  { key: 'admin_users',      group: 'Panel administrateur', label: 'Gestion des utilisateurs',     desc: 'Création et modification des comptes utilisateurs.',                    defaultOn: true,  protect: false },
  { key: 'admin_agents',     group: 'Panel administrateur', label: 'Gestion des agents',           desc: 'Création et gestion des comptes agents.',                               defaultOn: true,  protect: false },
  { key: 'admin_stats',      group: 'Panel administrateur', label: 'Statistiques',                 desc: 'Graphiques de répartition par statut et priorité.',                    defaultOn: true,  protect: false },
  { key: 'admin_settings',   group: 'Panel administrateur', label: 'Paramètres système',           desc: 'Configuration générale et notifications.',                              defaultOn: true,  protect: false },
];

/* ── Stockage ── */
function _loadStored() {
  try {
    const raw = localStorage.getItem(TF_FEATURES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveStored(map) {
  localStorage.setItem(TF_FEATURES_KEY, JSON.stringify(map));
}

/* Retourne { key: boolean } avec fallback sur defaultOn */
function _getStateMap() {
  const stored = _loadStored();
  const map = {};
  FEATURES_DEF.forEach(f => {
    map[f.key] = (f.key in stored) ? stored[f.key] : f.defaultOn;
  });
  return map;
}

/* ── API publique ── */

function isEnabled(key) {
  return _getStateMap()[key] !== false; // true par défaut si clé inconnue
}

function saveFeatures(map) {
  _saveStored(map);
}

function getFeatures() {
  const state = _getStateMap();
  const result = {};
  FEATURES_DEF.forEach(f => {
    result[f.key] = { ...f, enabled: state[f.key] };
  });
  return result;
}

/**
 * Retourne les modules groupés pour l'affichage admin.
 * @returns { [groupName]: [{key, label, desc, protect, enabled}] }
 */
function getGroupedFeatures() {
  const state  = _getStateMap();
  const groups = {};
  FEATURES_DEF.forEach(f => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push({ ...f, enabled: state[f.key] });
  });
  return groups;
}

/**
 * Active ou désactive un module et persiste.
 */
function toggleFeatureSave(key, enabled) {
  const map = _getStateMap();
  map[key] = enabled;
  _saveStored(map);
}

/**
 * Passe tous les modules à enabled/disabled sauf dashboard_admin.
 */
function setAllFeaturesSave(enabled) {
  const map = _getStateMap();
  FEATURES_DEF.forEach(f => {
    if (f.key !== 'dashboard_admin') map[f.key] = enabled;
  });
  _saveStored(map);
}

/**
 * Redirige vers la page "Prochainement" si le module est désactivé.
 * À appeler en tête de chaque page protégée.
 */
function requireFeature(key) {
  if (!isEnabled(key)) {
    const inPages = window.location.pathname.includes('/pages/');
    window.location.href = (inPages ? '../' : '') + 'pages/unavailable.html?feature=' + key;
  }
}

/**
 * Masque un élément DOM si le module est désactivé.
 */
function applyFeature(key, selector) {
  if (isEnabled(key)) return;
  document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
}
