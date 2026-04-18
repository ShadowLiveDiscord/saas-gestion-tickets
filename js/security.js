/**
 * TicketFlow — Module de Sécurité
 *
 * Ce module centralise toutes les fonctions de sécurité :
 *  - Hachage des mots de passe (PBKDF2 via Web Crypto API)
 *  - Gestion des sessions sécurisées (token + IndexedDB)
 *  - Rate limiting anti-bruteforce
 *  - Sanitisation des entrées (protection XSS)
 *  - Validation des données
 */

/* ─────────────────────────────────────────
   CONSTANTES DE SÉCURITÉ
───────────────────────────────────────── */
const SEC = {
  PBKDF2_ITERATIONS : 150_000,   // Nombre d'itérations PBKDF2 (plus élevé = plus sûr)
  PBKDF2_HASH      : 'SHA-256',  // Algorithme de hachage
  SALT_BYTES       : 16,         // Taille du sel (bytes)
  TOKEN_BYTES      : 32,         // Taille du token de session (bytes)
  SESSION_TTL      : 24 * 60 * 60 * 1000, // Durée de session : 24 heures
  MAX_ATTEMPTS     : 5,          // Tentatives avant blocage
  LOCKOUT_MS       : 15 * 60 * 1000,      // Durée de blocage : 15 minutes
  LS_SESSION_KEY   : 'tf_session_token',  // Clé localStorage du token
  LS_LEGACY_KEY    : 'tf_user',           // Clé legacy pour compatibilité dashboards
};

/* ─────────────────────────────────────────
   1. HACHAGE MOT DE PASSE (PBKDF2)
   Web Crypto API — natif au navigateur, pas de bibliothèque externe
───────────────────────────────────────── */

/**
 * Génère un sel cryptographique aléatoire (hex string)
 */
function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(SEC.SALT_BYTES));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Génère un token aléatoire sécurisé (hex string)
 */
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(SEC.TOKEN_BYTES));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hache un mot de passe avec PBKDF2
 * @param {string} password - Le mot de passe en clair
 * @param {string} salt     - Le sel (hex string)
 * @returns {Promise<string>} Hash hex
 */
async function hashPassword(password, salt) {
  const enc     = new TextEncoder();
  const keyMat  = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name      : 'PBKDF2',
      salt      : enc.encode(salt),
      iterations: SEC.PBKDF2_ITERATIONS,
      hash      : SEC.PBKDF2_HASH,
    },
    keyMat,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vérifie si un mot de passe correspond au hash stocké
 */
async function verifyPassword(password, storedHash, salt) {
  const computed = await hashPassword(password, salt);
  // Comparaison en temps constant pour éviter les timing attacks
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/* ─────────────────────────────────────────
   2. SANITISATION DES ENTRÉES (XSS)
───────────────────────────────────────── */

/**
 * Échappe les caractères HTML pour prévenir les injections XSS
 */
function sanitizeHTML(str) {
  if (str == null) return '';
  const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;','=':'&#x3D;' };
  return String(str).replace(/[&<>"'`=]/g, s => map[s]);
}

/**
 * Sanitise un objet en profondeur (toutes les valeurs string)
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = typeof v === 'string' ? sanitizeHTML(v) : (typeof v === 'object' ? sanitizeObject(v) : v);
  }
  return result;
}

/**
 * Valide et nettoie un email
 */
function validateEmail(email) {
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase().trim());
}

/**
 * Valide la robustesse d'un mot de passe
 * @returns {{ ok: boolean, message: string, score: number }}
 */
function validatePassword(pwd) {
  if (!pwd || pwd.length < 8) return { ok: false, message: 'Au moins 8 caractères requis.', score: 0 };
  let score = 0;
  if (pwd.length >= 12)          score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return { ok: true, message: score >= 2 ? 'Mot de passe accepté' : 'Mot de passe faible', score };
}

/* ─────────────────────────────────────────
   3. RATE LIMITING (anti-bruteforce)
───────────────────────────────────────── */

function _rlKey(email) { return 'tf_rl_' + btoa(email.toLowerCase()); }

function getRateLimitData(email) {
  try { return JSON.parse(localStorage.getItem(_rlKey(email)) || '{"count":0,"until":0}'); }
  catch { return { count: 0, until: 0 }; }
}

/**
 * Vérifie si l'email est actuellement bloqué
 * @returns {{ blocked: boolean, minutesLeft: number, attemptsLeft: number }}
 */
function checkRateLimit(email) {
  const d = getRateLimitData(email);
  const now = Date.now();
  if (d.until > now) {
    return { blocked: true, minutesLeft: Math.ceil((d.until - now) / 60000), attemptsLeft: 0 };
  }
  return { blocked: false, minutesLeft: 0, attemptsLeft: SEC.MAX_ATTEMPTS - (d.count || 0) };
}

/**
 * Enregistre une tentative échouée
 * @returns {{ blocked: boolean, minutesLeft: number, attemptsLeft: number }}
 */
function recordFailedAttempt(email) {
  const d = getRateLimitData(email);
  const now = Date.now();
  if (d.until > now) return { blocked: true, minutesLeft: Math.ceil((d.until - now) / 60000), attemptsLeft: 0 };
  d.count = (d.count || 0) + 1;
  if (d.count >= SEC.MAX_ATTEMPTS) {
    d.until = now + SEC.LOCKOUT_MS;
    d.count = 0;
    localStorage.setItem(_rlKey(email), JSON.stringify(d));
    return { blocked: true, minutesLeft: Math.ceil(SEC.LOCKOUT_MS / 60000), attemptsLeft: 0 };
  }
  localStorage.setItem(_rlKey(email), JSON.stringify(d));
  return { blocked: false, minutesLeft: 0, attemptsLeft: SEC.MAX_ATTEMPTS - d.count };
}

function clearRateLimit(email) { localStorage.removeItem(_rlKey(email)); }

/* ─────────────────────────────────────────
   4. GESTION DES SESSIONS
───────────────────────────────────────── */

const SessionDB = {
  _store: 'sessions',
  getByToken: (token) => _getByIndex ? _getByIndex('sessions', 'idx_token', token).then(r => r[0] || null)
                                     : Promise.resolve(null),
  save:        (s)     => typeof _put !== 'undefined' ? _put('sessions', s) : Promise.resolve(),
  delete:      (token) => typeof _delete !== 'undefined' ? _delete('sessions', token) : Promise.resolve(),
  deleteExpired: async () => {
    if (typeof _getAll === 'undefined') return;
    const all = await _getAll('sessions');
    const now = Date.now();
    for (const s of all) { if (s.expiresAt < now) await _delete('sessions', s.token); }
  },
};

/**
 * Crée une nouvelle session sécurisée après connexion réussie
 */
async function createSession(user) {
  const token = generateToken();
  const session = {
    token,
    email     : user.email,
    role      : user.role,
    name      : user.name,
    avatar    : user.avatar || (user.name || 'U').charAt(0).toUpperCase(),
    picture   : user.picture || null,
    provider  : user.provider || 'local',
    createdAt : Date.now(),
    expiresAt : Date.now() + SEC.SESSION_TTL,
  };

  try { await SessionDB.save(session); } catch(e) { console.warn('[Security] SessionDB save error:', e); }

  // Stocker le token ET maintenir la compatibilité avec les dashboards existants
  localStorage.setItem(SEC.LS_SESSION_KEY, token);
  localStorage.setItem(SEC.LS_LEGACY_KEY, JSON.stringify({
    email   : session.email,
    name    : session.name,
    role    : session.role,
    avatar  : session.avatar,
    picture : session.picture,
    provider: session.provider,
    _token  : token,
    _exp    : session.expiresAt,
  }));

  return session;
}

/**
 * Récupère et valide la session courante
 * @returns {Promise<object|null>} session ou null si invalide/expirée
 */
async function getSession() {
  // Vérification rapide via localStorage (legacy format)
  const legacyRaw = localStorage.getItem(SEC.LS_LEGACY_KEY);
  if (!legacyRaw) return null;

  try {
    const legacy = JSON.parse(legacyRaw);
    // Vérifier expiration si disponible
    if (legacy._exp && legacy._exp < Date.now()) {
      await destroySession();
      return null;
    }
    return legacy;
  } catch { return null; }
}

/**
 * Détruit la session courante (logout)
 */
async function destroySession() {
  const token = localStorage.getItem(SEC.LS_SESSION_KEY);
  if (token) {
    try { await SessionDB.delete(token); } catch(e) {}
  }
  localStorage.removeItem(SEC.LS_SESSION_KEY);
  localStorage.removeItem(SEC.LS_LEGACY_KEY);
}

/**
 * Vérifie la session et redirige si invalide.
 * À appeler au début de chaque dashboard.
 * @param {string|null} requiredRole - Rôle requis ('admin'|'agent'|'user'|null)
 * @returns {Promise<object|null>} session ou null (avec redirection)
 */
async function requireAuth(requiredRole = null) {
  const session = await getSession();

  if (!session) {
    window.location.href = '../pages/login.html';
    return null;
  }

  if (requiredRole && session.role !== 'admin' && session.role !== requiredRole) {
    window.location.href = '../pages/login.html';
    return null;
  }

  return session;
}

/* ─────────────────────────────────────────
   5. CONTENT SECURITY POLICY (Meta tag)
   Ajoute un CSP de base si non présent
───────────────────────────────────────── */
(function applyCSP() {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  // Politique permissive pour un app client-side (ajuster selon besoins)
  meta.content = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://accounts.google.com",
    "frame-src https://accounts.google.com",
  ].join('; ');
  document.head.prepend(meta);
})();

/* ─────────────────────────────────────────
   6. NETTOYAGE AUTOMATIQUE
   Supprime les sessions expirées au démarrage
───────────────────────────────────────── */
window.addEventListener('load', async () => {
  try { await SessionDB.deleteExpired(); } catch(e) {}
});

/* ─────────────────────────────────────────
   EXPORT (objet global Security)
───────────────────────────────────────── */
const Security = {
  // Passwords
  generateSalt,
  generateToken,
  hashPassword,
  verifyPassword,
  validatePassword,
  // Sanitization
  sanitizeHTML,
  sanitizeObject,
  validateEmail,
  // Rate limiting
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  // Sessions
  createSession,
  getSession,
  destroySession,
  requireAuth,
  SEC,
};
