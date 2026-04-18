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

  /* ── Outils ── */
  { key: 'codeur_generator', group: 'Outils',               label: 'Générateur Codeur.com',         desc: 'Outil de génération de messages de candidature et de devis PDF.',              defaultOn: true,  protect: false },

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
 * Passe tous les modules à enabled/disabled sauf dashboard_admin et login.
 * Ces deux modules sont protégés : sans login, l'admin ne peut plus accéder au panel.
 */
function setAllFeaturesSave(enabled) {
  const map = _getStateMap();
  const ALWAYS_ON = ['dashboard_admin', 'login'];
  FEATURES_DEF.forEach(f => {
    if (!ALWAYS_ON.includes(f.key)) map[f.key] = enabled;
  });
  _saveStored(map);
}

/**
 * Redirige vers la page "Prochainement" si le module est désactivé.
 * dashboard_admin et login sont TOUJOURS accessibles (ne peuvent pas être bloqués).
 */
function requireFeature(key) {
  // Ces modules sont inviolables — jamais bloqués
  const ALWAYS_ACCESSIBLE = ['dashboard_admin', 'login'];
  if (ALWAYS_ACCESSIBLE.includes(key)) return;

  if (!isEnabled(key)) {
    const inPages = window.location.pathname.includes('/pages/');
    window.location.href = (inPages ? '../' : '') + 'pages/unavailable.html?feature=' + key;
  }
}

/**
 * Réinitialise TOUS les feature flags à leurs valeurs par défaut.
 * Accessible via URL ?reset_features=1 ou depuis la console.
 */
function resetAllFeatures() {
  localStorage.removeItem(TF_FEATURES_KEY);
  console.log('[Features] Tous les modules réinitialisés aux valeurs par défaut.');
}

/* ── Reset d'urgence via URL ──
   Ajouter ?reset_features=1 dans n'importe quelle URL pour tout réinitialiser */
(function checkEmergencyReset() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset_features') === '1') {
    resetAllFeatures();
    // Retirer le paramètre de l'URL et recharger proprement
    const clean = window.location.href
      .replace(/[?&]reset_features=1/, '')
      .replace(/\?$/, '');
    window.history.replaceState({}, '', clean);

    // Toast de confirmation
    const t = document.createElement('div');
    t.textContent = '✓ Modules réinitialisés aux valeurs par défaut';
    Object.assign(t.style, {
      position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
      background:'#10b981', color:'white', padding:'12px 22px', borderRadius:'12px',
      fontSize:'.875rem', fontWeight:'700', zIndex:'999999', fontFamily:'Inter,sans-serif',
      boxShadow:'0 8px 24px rgba(16,185,129,.4)'
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
})();

/**
 * Masque un élément DOM si le module est désactivé.
 */
function applyFeature(key, selector) {
  if (isEnabled(key)) return;
  document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
}

/* ─────────────────────────────────────────
   RACCOURCI CLAVIER — Alt+A → Panel Admin
───────────────────────────────────────── */

(function initAdminShortcut() {

  /* Résoudre le chemin vers dashboard-admin selon la page courante */
  function adminPath() {
    const inPages = window.location.pathname.includes('/pages/');
    return inPages ? 'dashboard-admin.html' : 'pages/dashboard-admin.html';
  }

  /* Toast rapide "style inline" (aucune dépendance CSS externe) */
  function shortcutToast(msg) {
    const existing = document.getElementById('_tf_shortcut_toast');
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.id = '_tf_shortcut_toast';
    t.innerHTML = msg;
    Object.assign(t.style, {
      position        : 'fixed',
      bottom          : '28px',
      left            : '50%',
      transform       : 'translateX(-50%) translateY(20px)',
      background      : 'linear-gradient(135deg,#1e1b4b,#4f46e5)',
      color           : '#fff',
      padding         : '11px 22px',
      borderRadius    : '12px',
      fontSize        : '0.875rem',
      fontWeight      : '600',
      fontFamily      : 'Inter,sans-serif',
      zIndex          : '999999',
      boxShadow       : '0 8px 30px rgba(79,70,229,.45)',
      transition      : 'all .25s cubic-bezier(.34,1.56,.64,1)',
      pointerEvents   : 'none',
      whiteSpace      : 'nowrap',
      display         : 'flex',
      alignItems      : 'center',
      gap             : '8px',
    });
    document.body.appendChild(t);

    // Animation entrée
    requestAnimationFrame(() => {
      t.style.transform = 'translateX(-50%) translateY(0)';
      t.style.opacity   = '1';
    });

    // Disparition
    setTimeout(() => {
      t.style.transform = 'translateX(-50%) translateY(20px)';
      t.style.opacity   = '0';
      setTimeout(() => t.remove(), 300);
    }, 1800);
  }

  /* Badge flottant discret en bas à droite (hint visuel permanent) */
  function injectShortcutBadge() {
    if (document.getElementById('_tf_admin_badge')) return;
    const badge = document.createElement('div');
    badge.id = '_tf_admin_badge';
    badge.title = 'Raccourci : Alt+A → Panel Admin';
    badge.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6
             11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623
             5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152
             c-3.196 0-6.1-1.248-8.25-3.285z"/>
      </svg>
      <kbd style="background:rgba(255,255,255,.2);padding:1px 5px;border-radius:4px;
                  font-size:.7rem;font-family:monospace;letter-spacing:.5px">Alt+A</kbd>`;
    Object.assign(badge.style, {
      position        : 'fixed',
      bottom          : '16px',
      right           : '16px',
      background      : 'linear-gradient(135deg,#1e1b4b,#4f46e5)',
      color           : '#fff',
      padding         : '6px 12px',
      borderRadius    : '20px',
      fontSize        : '.75rem',
      fontWeight      : '600',
      fontFamily      : 'Inter,sans-serif',
      zIndex          : '99998',
      cursor          : 'pointer',
      display         : 'flex',
      alignItems      : 'center',
      gap             : '6px',
      boxShadow       : '0 4px 14px rgba(79,70,229,.4)',
      opacity         : '.75',
      transition      : 'opacity .2s,transform .2s',
      userSelect      : 'none',
    });
    badge.onmouseenter = () => { badge.style.opacity = '1'; badge.style.transform = 'scale(1.05)'; };
    badge.onmouseleave = () => { badge.style.opacity = '.75'; badge.style.transform = 'scale(1)'; };
    badge.onclick      = () => goAdmin();
    document.body.appendChild(badge);
  }

  /* Navigation vers le panel admin */
  function goAdmin() {
    // Forcer dashboard_admin et login activés (mesure de sécurité)
    try {
      const map = _getStateMap();
      map['dashboard_admin'] = true;
      map['login']           = true;
      _saveStored(map);
    } catch {}

    let role = null;
    try {
      const s = localStorage.getItem('tf_user');
      if (s) role = JSON.parse(s).role;
    } catch {}

    if (role === 'admin') {
      shortcutToast('🛡️ Panel Admin <span style="opacity:.6;font-size:.8rem">→ ouverture…</span>');
      setTimeout(() => { window.location.href = adminPath(); }, 600);
    } else if (role) {
      shortcutToast('⚠️ Accès admin requis — redirection connexion');
      setTimeout(() => {
        const inPages = window.location.pathname.includes('/pages/');
        window.location.href = (inPages ? '' : 'pages/') + 'login.html';
      }, 900);
    } else {
      shortcutToast('🔐 Connexion requise');
      setTimeout(() => {
        const inPages = window.location.pathname.includes('/pages/');
        window.location.href = (inPages ? '' : 'pages/') + 'login.html';
      }, 900);
    }
  }

  /* Écouteur clavier : Alt+A */
  document.addEventListener('keydown', function(e) {
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey
        && (e.key === 'a' || e.key === 'A' || e.key === 'à')) {
      e.preventDefault();
      goAdmin();
    }
  });

  /* Injecter le badge une fois le DOM prêt */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectShortcutBadge);
  } else {
    injectShortcutBadge();
  }

})();
