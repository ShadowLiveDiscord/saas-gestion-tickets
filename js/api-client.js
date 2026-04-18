/**
 * TicketFlow — Client API (MySQL via serveur Express)
 *
 * Remplace database.js (IndexedDB) par des appels fetch vers l'API REST.
 * Interface identique → les dashboards n'ont pas besoin de changer.
 *
 * Le token de session est automatiquement envoyé dans l'en-tête
 * X-Session-Token à chaque requête authentifiée.
 */

// URL de l'API — définie automatiquement dans js/config.js
const API_BASE = (typeof TF_CONFIG !== 'undefined') ? TF_CONFIG.API_URL : (() => {
  const h = window.location.hostname;
  const p = window.location.protocol;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : `${p}//${h}:3001/api`;
})();

/* ─────────────────────────────────────────
   HELPER FETCH
───────────────────────────────────────── */

async function _apiFetch(path, options = {}) {
  const token = localStorage.getItem('tf_session_token');

  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type'    : 'application/json',
      'X-Session-Token' : token || '',
      ...(options.headers || {}),
    },
    ...options,
  });

  // Session expirée → redirection
  if (res.status === 401) {
    localStorage.removeItem('tf_user');
    localStorage.removeItem('tf_session_token');
    const inPages = window.location.pathname.includes('/pages/');
    window.location.href = (inPages ? '' : 'pages/') + 'login.html';
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur API ' + res.status);
  return data;
}

const _get    = (path)         => _apiFetch(path);
const _post   = (path, body)   => _apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const _put    = (path, body)   => _apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) });
const _delete = (path)         => _apiFetch(path, { method: 'DELETE' });

/* ─────────────────────────────────────────
   VÉRIFICATION DISPONIBILITÉ API
───────────────────────────────────────── */

let _apiAvailable = null;

async function isApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const r = await fetch(API_BASE + '/health', { signal: AbortSignal.timeout(2000) });
    _apiAvailable = r.ok;
  } catch { _apiAvailable = false; }
  return _apiAvailable;
}

/* ─────────────────────────────────────────
   AUTH API (login / register / session)
───────────────────────────────────────── */

const AuthAPI = {
  async login(email, password) {
    const data = await _post('/auth/login', { email, password });
    if (data) {
      localStorage.setItem('tf_session_token', data.token);
      localStorage.setItem('tf_user', JSON.stringify(data.user));
    }
    return data;
  },

  async register(userData) {
    const data = await _post('/auth/register', userData);
    if (data) {
      localStorage.setItem('tf_session_token', data.token);
      localStorage.setItem('tf_user', JSON.stringify(data.user));
    }
    return data;
  },

  async logout() {
    await _post('/auth/logout', {}).catch(() => {});
    localStorage.removeItem('tf_session_token');
    localStorage.removeItem('tf_user');
  },

  async getSession() {
    const token = localStorage.getItem('tf_session_token');
    if (!token) return null;
    try {
      const data = await _get('/auth/session');
      return data?.session || null;
    } catch { return null; }
  },
};

/* ─────────────────────────────────────────
   TICKETS API
   Interface identique à TicketDB
───────────────────────────────────────── */

const TicketDB = {
  getAll        : () => _get('/tickets'),
  getByUser     : (email) => _get('/tickets').then(tickets => (tickets || []).filter(t => t.user_email === email)),
  getByStatus   : (status) => _get('/tickets').then(tickets => (tickets || []).filter(t => t.status === status)),
  count         : () => _get('/tickets').then(t => (t || []).length),
  save          : (ticket) => ticket.id
    ? _put('/tickets/' + ticket.id, ticket)
    : _post('/tickets', ticket),
  delete        : (id) => _delete('/tickets/' + id),
  saveMany      : async (tickets) => { for (const t of tickets) await TicketDB.save(t); },
};

/* ─────────────────────────────────────────
   USERS API
   Interface identique à UserDB
───────────────────────────────────────── */

const UserDB = {
  getAll       : () => _get('/users'),
  count        : () => _get('/users').then(u => (u || []).length),
  getByEmail   : (email) => _get('/users').then(users => (users || []).find(u => u.email === email.toLowerCase()) || null),
  save         : (user) => user.id && !user.id.startsWith('new_')
    ? _put('/users/' + user.id, user)
    : _post('/users', user),
  delete       : (id) => _delete('/users/' + id),
  saveMany     : async (users) => { for (const u of users) await UserDB.save(u); },
};

/* ─────────────────────────────────────────
   AGENTS API
   Interface identique à AgentDB
───────────────────────────────────────── */

const AgentDB = {
  getAll       : () => _get('/agents'),
  count        : () => _get('/agents').then(a => (a || []).length),
  getByEmail   : (email) => _get('/agents').then(agents => (agents || []).find(a => a.email === email.toLowerCase()) || null),
  save         : (agent) => agent.id && !agent.id.startsWith('new_')
    ? _put('/agents/' + agent.id, agent)
    : _post('/agents', agent),
  delete       : (id) => _delete('/agents/' + id),
  saveMany     : async (agents) => { for (const a of agents) await AgentDB.save(a); },
};

/* ─────────────────────────────────────────
   SESSION (compatibilité avec security.js)
───────────────────────────────────────── */

// Surcharge de Security.createSession pour utiliser l'API
// (la session est déjà créée côté serveur lors du login)
if (typeof Security !== 'undefined') {
  const _origCreate = Security.createSession;
  Security.createSession = async function(user) {
    // Si login via API, la session est déjà créée côté serveur
    // On stocke juste localement
    if (user._token) {
      localStorage.setItem('tf_session_token', user._token);
      localStorage.setItem('tf_user', JSON.stringify(user));
      return user;
    }
    return _origCreate ? _origCreate(user) : user;
  };

  const _origGet = Security.getSession;
  Security.getSession = async function() {
    const token = localStorage.getItem('tf_session_token');
    if (token) {
      try {
        const legacyRaw = localStorage.getItem('tf_user');
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw);
          if (legacy._exp && legacy._exp < Date.now()) {
            await Security.destroySession();
            return null;
          }
          return legacy;
        }
      } catch {}
    }
    return _origGet ? _origGet() : null;
  };

  Security.destroySession = async function() {
    await AuthAPI.logout();
  };
}

/* ─────────────────────────────────────────
   initDB : compatibilité (no-op pour l'API)
───────────────────────────────────────── */

async function initDB() {
  // Vérifier que l'API est disponible
  const ok = await isApiAvailable();
  if (!ok) {
    console.warn('[API] Serveur non disponible sur', API_BASE);
    console.warn('[API] Lancez : cd server && npm install && node server.js');
  } else {
    console.log('[API] Connecté à MySQL via', API_BASE);
  }
  return ok;
}

// SessionDB stub (compatibilité avec security.js)
if (typeof SessionDB === 'undefined') {
  window.SessionDB = {
    save        : async () => {},
    delete      : async () => {},
    deleteExpired: async () => {},
    getByToken  : async () => null,
  };
}
