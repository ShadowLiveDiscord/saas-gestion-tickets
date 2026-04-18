/**
 * TicketFlow — Serveur API Express + MySQL
 *
 * Lance avec : node server.js  (ou nodemon server.js en dev)
 * Port par défaut : 3001
 *
 * Routes :
 *   POST /api/auth/login
 *   POST /api/auth/register
 *   POST /api/auth/logout
 *   GET  /api/auth/session
 *
 *   GET    /api/tickets
 *   POST   /api/tickets
 *   PUT    /api/tickets/:id
 *   DELETE /api/tickets/:id
 *
 *   GET    /api/users
 *   POST   /api/users
 *   PUT    /api/users/:id
 *   DELETE /api/users/:id
 *
 *   GET    /api/agents
 *   POST   /api/agents
 *   PUT    /api/agents/:id
 *   DELETE /api/agents/:id
 */

require('dotenv').config();
const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.SERVER_PORT || 3001;

/* ═══════════════════════════════════════
   CONFIGURATION MYSQL
═══════════════════════════════════════ */
const dbConfig = {
  host               : process.env.DB_HOST     || 'localhost',
  port               : parseInt(process.env.DB_PORT || '3306'),
  database           : process.env.DB_NAME     || 'ticketflow',
  user               : process.env.DB_USER     || 'ticketflow',
  password           : process.env.DB_PASSWORD || '',
  waitForConnections : true,
  connectionLimit    : 10,
  charset            : 'utf8mb4',
  timezone           : '+00:00',
};

let pool;

async function getDB() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    console.log('[DB] Pool MySQL créé →', dbConfig.host + ':' + dbConfig.port + '/' + dbConfig.database);
    await initSchema();
    await seedDemoAccounts();
  }
  return pool;
}

/* ═══════════════════════════════════════
   SCHÉMA : création automatique des tables
═══════════════════════════════════════ */
async function initSchema() {
  const db = pool;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id           VARCHAR(100) NOT NULL PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      email        VARCHAR(255) NOT NULL,
      role         ENUM('user','agent','admin') NOT NULL DEFAULT 'user',
      password_hash VARCHAR(128) DEFAULT NULL,
      password_salt VARCHAR(64)  DEFAULT NULL,
      company      VARCHAR(255)  DEFAULT NULL,
      created_at   DATETIME     NOT NULL DEFAULT NOW(),
      suspended    TINYINT(1)   NOT NULL DEFAULT 0,
      provider     VARCHAR(50)  NOT NULL DEFAULT 'local',
      picture      TEXT         DEFAULT NULL,
      is_demo      TINYINT(1)   NOT NULL DEFAULT 0,
      UNIQUE KEY uq_email (email),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id         VARCHAR(100) NOT NULL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      email      VARCHAR(255) NOT NULL,
      specialty  VARCHAR(255) DEFAULT 'Généraliste',
      tickets    INT NOT NULL DEFAULT 0,
      resolved   INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uq_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_email  VARCHAR(255) NOT NULL,
      title       VARCHAR(500) NOT NULL,
      category    VARCHAR(100) DEFAULT 'Général',
      priority    ENUM('bas','moyen','eleve','critique') NOT NULL DEFAULT 'moyen',
      status      ENUM('ouvert','en_cours','resolu','ferme') NOT NULL DEFAULT 'ouvert',
      date        DATE NOT NULL DEFAULT (CURDATE()),
      description TEXT DEFAULT NULL,
      messages    JSON DEFAULT NULL,
      assigned_to VARCHAR(255) DEFAULT NULL,
      created_at  DATETIME NOT NULL DEFAULT NOW(),
      updated_at  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_user_email (user_email),
      INDEX idx_status     (status),
      INDEX idx_priority   (priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      VARCHAR(128) NOT NULL PRIMARY KEY,
      email      VARCHAR(255) NOT NULL,
      role       VARCHAR(50)  NOT NULL,
      name       VARCHAR(255) NOT NULL,
      avatar     VARCHAR(10)  DEFAULT NULL,
      picture    TEXT         DEFAULT NULL,
      provider   VARCHAR(50)  NOT NULL DEFAULT 'local',
      created_at BIGINT       NOT NULL,
      expires_at BIGINT       NOT NULL,
      INDEX idx_email      (email),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('[DB] Tables vérifiées/créées ✓');
}

/* ═══════════════════════════════════════
   SEED : comptes de démo
═══════════════════════════════════════ */
async function seedDemoAccounts() {
  const db = pool;
  const DEMO = [
    { id: 'acc_admin', name: 'Admin Principal',  email: 'admin@ticketflow.fr', role: 'admin', password: 'admin123' },
    { id: 'acc_agent', name: 'Agent Support',    email: 'agent@ticketflow.fr', role: 'agent', password: 'agent123' },
    { id: 'acc_user',  name: 'Utilisateur Demo', email: 'user@ticketflow.fr',  role: 'user',  password: 'user123'  },
  ];

  for (const acc of DEMO) {
    const [[existing]] = await db.execute('SELECT id, password_hash FROM users WHERE email=?', [acc.email]);
    if (existing && existing.password_hash) continue;

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await bcrypt.hash(acc.password + salt, 12);

    await db.execute(`
      INSERT INTO users (id, name, email, role, password_hash, password_salt, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), password_salt=VALUES(password_salt)
    `, [acc.id, acc.name, acc.email, acc.role, hash, salt]);
  }

  // Agents de démo
  await db.execute(`
    INSERT IGNORE INTO agents (id, name, email, specialty, tickets, resolved) VALUES
    ('acc_agent',  'Agent Support',  'agent@ticketflow.fr', 'Généraliste', 12, 9),
    ('agent_alice','Alice Lefebvre', 'alice@ticketflow.fr', 'Technique',   8,  7)
  `);

  // Tickets de démo (seulement si la table est vide)
  const [[{ cnt }]] = await db.execute('SELECT COUNT(*) as cnt FROM tickets');
  if (parseInt(cnt) === 0) {
    await db.execute(`
      INSERT INTO tickets (user_email, title, category, priority, status, date, description, messages) VALUES
      ('user@ticketflow.fr','Impossible de me connecter','Compte','eleve','en_cours','2026-03-28',
       'Depuis ce matin, je n arrive plus à accéder à mon compte.',
       '[{"from":"agent","text":"Nous avons pris en charge votre ticket.","time":"10:30"}]'),
      ('user@ticketflow.fr','Problème de facturation','Facturation','moyen','ouvert','2026-03-30',
       'Ma facture du mois de mars ne correspond pas à mon abonnement.','[]'),
      ('user@ticketflow.fr','Demande fonctionnalité','Commercial','bas','resolu','2026-03-15',
       'Je souhaiterais un export CSV.',
       '[{"from":"agent","text":"Disponible en version Pro !","time":"14:20"}]')
    `);
  }

  console.log('[DB] Comptes de démo initialisés ✓');
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function respond(res, data, status = 200) {
  res.status(status).json(data);
}

function error(res, message, status = 400) {
  res.status(status).json({ error: message });
}

// Nettoyer les sessions expirées
async function cleanSessions() {
  const db = await getDB();
  await db.execute('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
}

/* ═══════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════ */
app.use(express.json({ limit: '2mb' }));

// CORS : accepte toutes les origines configurées (séparées par virgule)
const allowedOrigins = (process.env.FRONTEND_URL || '*')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Pas d'origine (appels serveur-à-serveur, outils) → ok
    if (!origin) return cb(null, true);
    // Wildcard → tout accepter
    if (allowedOrigins.includes('*')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqué pour ' + origin));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Session-Token'],
  credentials: true,
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

// Rate limiting strict sur login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives de connexion.' },
});

// Middleware auth : vérifie le token dans le header X-Session-Token
async function authMiddleware(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token) return error(res, 'Non authentifié', 401);

  try {
    const db = await getDB();
    const [[session]] = await db.execute(
      'SELECT * FROM sessions WHERE token=? AND expires_at > ?',
      [token, Date.now()]
    );
    if (!session) return error(res, 'Session invalide ou expirée', 401);
    req.session = session;
    next();
  } catch(e) {
    console.error('[Auth]', e);
    error(res, 'Erreur serveur', 500);
  }
}

// Middleware admin uniquement
function adminOnly(req, res, next) {
  if (req.session?.role !== 'admin') return error(res, 'Accès réservé à l\'admin', 403);
  next();
}

/* ═══════════════════════════════════════
   ROUTES AUTH
═══════════════════════════════════════ */

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return error(res, 'Email et mot de passe requis');

  try {
    const db = await getDB();
    const [[user]] = await db.execute('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    if (!user || !user.password_hash) return error(res, 'Email ou mot de passe incorrect', 401);
    if (user.suspended) return error(res, 'Ce compte est suspendu', 403);

    const valid = await bcrypt.compare(password + user.password_salt, user.password_hash);
    if (!valid) return error(res, 'Email ou mot de passe incorrect', 401);

    // Créer session
    const token = generateToken();
    const now   = Date.now();
    const exp   = now + 24 * 60 * 60 * 1000;

    await db.execute(
      'INSERT INTO sessions (token,email,role,name,avatar,picture,provider,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [token, user.email, user.role, user.name, user.name.charAt(0).toUpperCase(), user.picture, user.provider || 'local', now, exp]
    );

    respond(res, {
      token,
      user: {
        email  : user.email,
        name   : user.name,
        role   : user.role,
        avatar : user.name.charAt(0).toUpperCase(),
        picture: user.picture,
        _token : token,
        _exp   : exp,
      }
    });
  } catch(e) {
    console.error('[Login]', e);
    error(res, 'Erreur serveur', 500);
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, company } = req.body;
  if (!name || !email || !password) return error(res, 'Champs obligatoires manquants');

  try {
    const db = await getDB();
    const [[existing]] = await db.execute('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (existing) return error(res, 'Un compte avec cet email existe déjà', 409);

    const id   = 'u_' + Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await bcrypt.hash(password + salt, 12);
    const userRole = ['user', 'agent'].includes(role) ? role : 'user';

    await db.execute(
      'INSERT INTO users (id,name,email,role,password_hash,password_salt,company,provider) VALUES(?,?,?,?,?,?,?,?)',
      [id, name, email.toLowerCase(), userRole, hash, salt, company || null, 'local']
    );

    const [[newUser]] = await db.execute('SELECT * FROM users WHERE id=?', [id]);

    // Créer session
    const token = generateToken();
    const now   = Date.now();
    const exp   = now + 24 * 60 * 60 * 1000;
    await db.execute(
      'INSERT INTO sessions (token,email,role,name,avatar,picture,provider,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [token, newUser.email, newUser.role, newUser.name, newUser.name.charAt(0).toUpperCase(), null, 'local', now, exp]
    );

    respond(res, {
      token,
      user: {
        email : newUser.email, name: newUser.name, role: newUser.role,
        avatar: newUser.name.charAt(0).toUpperCase(), _token: token, _exp: exp,
      }
    }, 201);
  } catch(e) {
    console.error('[Register]', e);
    error(res, 'Erreur serveur', 500);
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) {
    try {
      const db = await getDB();
      await db.execute('DELETE FROM sessions WHERE token=?', [token]);
    } catch(e) {}
  }
  respond(res, { ok: true });
});

// GET /api/auth/session
app.get('/api/auth/session', authMiddleware, (req, res) => {
  respond(res, { session: req.session });
});

/* ═══════════════════════════════════════
   ROUTES TICKETS
═══════════════════════════════════════ */

// GET /api/tickets  → tous (admin/agent) ou filtrés par email (user)
app.get('/api/tickets', authMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    let rows;
    if (req.session.role === 'user') {
      [rows] = await db.execute('SELECT * FROM tickets WHERE user_email=? ORDER BY created_at DESC', [req.session.email]);
    } else {
      [rows] = await db.execute('SELECT * FROM tickets ORDER BY created_at DESC');
    }
    // Parser messages JSON
    rows = rows.map(r => ({ ...r, messages: r.messages || [] }));
    respond(res, rows);
  } catch(e) { error(res, 'Erreur serveur', 500); }
});

// POST /api/tickets
app.post('/api/tickets', authMiddleware, async (req, res) => {
  const { title, category, priority, description } = req.body;
  if (!title) return error(res, 'Titre requis');
  try {
    const db = await getDB();
    const [result] = await db.execute(
      'INSERT INTO tickets (user_email,title,category,priority,description,messages,date) VALUES(?,?,?,?,?,?,CURDATE())',
      [req.session.email, title, category || 'Général', priority || 'moyen', description || '', '[]']
    );
    const [[ticket]] = await db.execute('SELECT * FROM tickets WHERE id=?', [result.insertId]);
    respond(res, { ...ticket, messages: [] }, 201);
  } catch(e) { console.error('[Ticket POST]', e); error(res, 'Erreur serveur', 500); }
});

// PUT /api/tickets/:id
app.put('/api/tickets/:id', authMiddleware, async (req, res) => {
  const { status, priority, assignedTo, messages, title, description } = req.body;
  try {
    const db = await getDB();
    const [[ticket]] = await db.execute('SELECT * FROM tickets WHERE id=?', [req.params.id]);
    if (!ticket) return error(res, 'Ticket introuvable', 404);

    // Un utilisateur ne peut modifier que ses propres tickets (et seulement les messages)
    if (req.session.role === 'user' && ticket.user_email !== req.session.email)
      return error(res, 'Accès refusé', 403);

    const updates = {};
    if (status)     updates.status      = status;
    if (priority)   updates.priority    = priority;
    if (assignedTo !== undefined) updates.assigned_to = assignedTo;
    if (messages)   updates.messages    = JSON.stringify(messages);
    if (title)      updates.title       = title;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) return respond(res, ticket);

    const setClauses = Object.keys(updates).map(k => `${k}=?`).join(',');
    await db.execute(`UPDATE tickets SET ${setClauses} WHERE id=?`, [...Object.values(updates), req.params.id]);
    const [[updated]] = await db.execute('SELECT * FROM tickets WHERE id=?', [req.params.id]);
    respond(res, { ...updated, messages: updated.messages || [] });
  } catch(e) { console.error('[Ticket PUT]', e); error(res, 'Erreur serveur', 500); }
});

// DELETE /api/tickets/:id  (admin seulement)
app.delete('/api/tickets/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const db = await getDB();
    await db.execute('DELETE FROM tickets WHERE id=?', [req.params.id]);
    respond(res, { ok: true });
  } catch(e) { error(res, 'Erreur serveur', 500); }
});

/* ═══════════════════════════════════════
   ROUTES USERS (admin)
═══════════════════════════════════════ */

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDB();
  const [rows] = await db.execute('SELECT id,name,email,role,company,created_at,suspended,provider,picture FROM users');
  respond(res, rows);
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, role, password } = req.body;
  if (!name || !email || !password) return error(res, 'Champs requis');
  try {
    const db   = await getDB();
    const id   = 'u_' + Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await bcrypt.hash(password + salt, 12);
    await db.execute(
      'INSERT INTO users (id,name,email,role,password_hash,password_salt) VALUES(?,?,?,?,?,?)',
      [id, name, email.toLowerCase(), role || 'user', hash, salt]
    );
    const [[u]] = await db.execute('SELECT id,name,email,role,created_at,suspended FROM users WHERE id=?', [id]);
    respond(res, u, 201);
  } catch(e) { error(res, 'Email déjà utilisé ou erreur serveur', 409); }
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { role, suspended, name } = req.body;
  try {
    const db  = await getDB();
    const upd = {};
    if (role !== undefined)      upd.role      = role;
    if (suspended !== undefined) upd.suspended = suspended ? 1 : 0;
    if (name)                    upd.name      = name;
    if (!Object.keys(upd).length) return error(res, 'Rien à mettre à jour');
    const setClauses = Object.keys(upd).map(k => `${k}=?`).join(',');
    await db.execute(`UPDATE users SET ${setClauses} WHERE id=?`, [...Object.values(upd), req.params.id]);
    const [[u]] = await db.execute('SELECT id,name,email,role,suspended FROM users WHERE id=?', [req.params.id]);
    respond(res, u);
  } catch(e) { error(res, 'Erreur serveur', 500); }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDB();
  await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
  respond(res, { ok: true });
});

/* ═══════════════════════════════════════
   ROUTES AGENTS (admin)
═══════════════════════════════════════ */

app.get('/api/agents', authMiddleware, async (req, res) => {
  const db = await getDB();
  const [rows] = await db.execute('SELECT * FROM agents');
  respond(res, rows);
});

app.post('/api/agents', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, specialty } = req.body;
  if (!name || !email) return error(res, 'Nom et email requis');
  try {
    const db = await getDB();
    const id = 'ag_' + Date.now();
    await db.execute('INSERT INTO agents (id,name,email,specialty) VALUES(?,?,?,?)',
      [id, name, email.toLowerCase(), specialty || 'Généraliste']);
    const [[a]] = await db.execute('SELECT * FROM agents WHERE id=?', [id]);
    respond(res, a, 201);
  } catch(e) { error(res, 'Email déjà utilisé ou erreur serveur', 409); }
});

app.put('/api/agents/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, specialty, tickets, resolved } = req.body;
  const db = await getDB();
  const upd = {};
  if (name)               upd.name      = name;
  if (specialty)          upd.specialty = specialty;
  if (tickets !== undefined) upd.tickets = tickets;
  if (resolved !== undefined) upd.resolved = resolved;
  if (!Object.keys(upd).length) return error(res, 'Rien à mettre à jour');
  const set = Object.keys(upd).map(k => `${k}=?`).join(',');
  await db.execute(`UPDATE agents SET ${set} WHERE id=?`, [...Object.values(upd), req.params.id]);
  const [[a]] = await db.execute('SELECT * FROM agents WHERE id=?', [req.params.id]);
  respond(res, a);
});

app.delete('/api/agents/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDB();
  await db.execute('DELETE FROM agents WHERE id=?', [req.params.id]);
  respond(res, { ok: true });
});

/* ═══════════════════════════════════════
   SANTÉ
═══════════════════════════════════════ */
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDB();
    await db.execute('SELECT 1');
    respond(res, { status: 'ok', db: 'connected', host: process.env.DB_HOST });
  } catch(e) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: e.message });
  }
});

/* ═══════════════════════════════════════
   DÉMARRAGE
═══════════════════════════════════════ */
app.listen(PORT, async () => {
  console.log('');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│   TicketFlow API — port ' + PORT + '                        │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log('  DB Host    :', process.env.DB_HOST + ':' + process.env.DB_PORT);
  console.log('  DB Name    :', process.env.DB_NAME);
  console.log('  CORS       :', process.env.FRONTEND_URL || '*');
  console.log('');

  try {
    await getDB();
    console.log('  ✓ Connecté à MySQL\n');
  } catch(e) {
    const code = e.code || '';
    console.error('\n  ✗ Erreur MySQL :', e.message || e);
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || !e.message) {
      console.error('\n  ⚠ CAUSE PROBABLE :');
      console.error('    Le host "localhost" dans .env désigne le MySQL INTERNE de lordhosting.');
      console.error('    Il n\'est pas accessible depuis votre PC local.\n');
      console.error('  SOLUTIONS :');
      console.error('    A) Déployez ce serveur (server.js) DIRECTEMENT sur lordhosting');
      console.error('       → le MySQL sera alors accessible en localhost depuis le serveur');
      console.error('');
      console.error('    B) Demandez à lordhosting d\'activer les connexions MySQL distantes');
      console.error('       → ils vous fourniront un hostname externe (ex: sql.lordhosting.com)');
      console.error('       → remplacez DB_HOST=localhost par ce hostname dans .env');
      console.error('');
      console.error('    C) Tunnel SSH (développement uniquement) :');
      console.error('       ssh -L 3307:localhost:3306 user@votre-serveur-lordhosting');
      console.error('       Puis DB_HOST=127.0.0.1 et DB_PORT=3307 dans .env\n');
    } else if (code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  → Mot de passe ou utilisateur incorrect dans server/.env\n');
    } else if (code === 'ER_BAD_DB_ERROR') {
      console.error('  → La base de données "' + process.env.DB_NAME + '" n\'existe pas encore.');
      console.error('    Exécutez le SQL fourni dans phpMyAdmin de lordhosting.\n');
    }
    console.error('    Code erreur :', code, '\n');
  }

  // Nettoyage des sessions expirées toutes les heures
  setInterval(cleanSessions, 60 * 60 * 1000);
});
