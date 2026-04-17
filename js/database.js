/**
 * TicketFlow — Couche Base de Données IndexedDB
 *
 * IndexedDB est une base de données transactionnelle intégrée au navigateur.
 * Avantages vs localStorage :
 *   - Capacité quasi illimitée (vs ~5 Mo)
 *   - Données structurées avec Object Stores (équivalent tables SQL)
 *   - Index pour des requêtes rapides (ex: tickets par email, par statut)
 *   - Transactions ACID (atomicité, cohérence, isolation, durabilité)
 *   - API asynchrone (ne bloque pas le thread UI)
 */

const DB_NAME    = 'ticketflow_db';
const DB_VERSION = 1;

let _db = null;

/* ─────────────────────────────────────────
   INITIALISATION & SCHÉMA
───────────────────────────────────────── */

/**
 * Ouvre (ou crée) la base de données.
 * onupgradeneeded = migration du schéma (comme ALTER TABLE en SQL)
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      /* ── Object Store : tickets ──
         Équivalent SQL :
         CREATE TABLE tickets (
           id         INTEGER PRIMARY KEY,
           userEmail  TEXT,
           title      TEXT,
           category   TEXT,
           priority   TEXT,  -- 'bas' | 'moyen' | 'eleve' | 'critique'
           status     TEXT,  -- 'ouvert' | 'en_cours' | 'resolu' | 'ferme'
           date       TEXT,
           desc       TEXT,
           messages   TEXT   -- JSON stringifié
         );
      */
      if (!db.objectStoreNames.contains('tickets')) {
        const ticketsStore = db.createObjectStore('tickets', { keyPath: 'id' });
        ticketsStore.createIndex('idx_userEmail', 'userEmail', { unique: false });
        ticketsStore.createIndex('idx_status',    'status',    { unique: false });
        ticketsStore.createIndex('idx_priority',  'priority',  { unique: false });
        ticketsStore.createIndex('idx_date',      'date',      { unique: false });
      }

      /* ── Object Store : users ──
         CREATE TABLE users (
           id        INTEGER PRIMARY KEY,
           name      TEXT,
           email     TEXT UNIQUE,
           role      TEXT,
           createdAt TEXT
         );
      */
      if (!db.objectStoreNames.contains('users')) {
        const usersStore = db.createObjectStore('users', { keyPath: 'id' });
        usersStore.createIndex('idx_email', 'email', { unique: true });
        usersStore.createIndex('idx_role',  'role',  { unique: false });
      }

      /* ── Object Store : agents ──
         CREATE TABLE agents (
           id         INTEGER PRIMARY KEY,
           name       TEXT,
           email      TEXT UNIQUE,
           specialty  TEXT,
           tickets    INTEGER,
           resolved   INTEGER
         );
      */
      if (!db.objectStoreNames.contains('agents')) {
        const agentsStore = db.createObjectStore('agents', { keyPath: 'id' });
        agentsStore.createIndex('idx_email', 'email', { unique: true });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(new Error('IndexedDB error: ' + e.target.error));
  });
}

/* ─────────────────────────────────────────
   FONCTIONS GÉNÉRIQUES CRUD
───────────────────────────────────────── */

async function _getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _getByIndex(store, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _put(store, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _putMany(store, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(store, 'readwrite');
    const oStore = tx.objectStore(store);
    items.forEach(item => oStore.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function _delete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function _count(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ─────────────────────────────────────────
   API TICKETS
   Équivalent SQL : SELECT / INSERT / UPDATE / DELETE sur la table tickets
───────────────────────────────────────── */

const TicketDB = {
  /** SELECT * FROM tickets WHERE userEmail = ? */
  getByUser:  (email) => _getByIndex('tickets', 'idx_userEmail', email),

  /** SELECT * FROM tickets WHERE status = ? */
  getByStatus: (status) => _getByIndex('tickets', 'idx_status', status),

  /** SELECT * FROM tickets ORDER BY date DESC */
  getAll:     () => _getAll('tickets'),

  /** SELECT COUNT(*) FROM tickets */
  count:      () => _count('tickets'),

  /** INSERT OR REPLACE INTO tickets VALUES (?) */
  save:       (ticket) => _put('tickets', ticket),

  /** INSERT OR REPLACE INTO tickets VALUES (?), (?), ... */
  saveMany:   (tickets) => _putMany('tickets', tickets),

  /** DELETE FROM tickets WHERE id = ? */
  delete:     (id) => _delete('tickets', id),
};

/* ─────────────────────────────────────────
   API USERS
───────────────────────────────────────── */

const UserDB = {
  getAll:   () => _getAll('users'),
  count:    () => _count('users'),
  save:     (user) => _put('users', user),
  saveMany: (users) => _putMany('users', users),
  delete:   (id) => _delete('users', id),
};

/* ─────────────────────────────────────────
   API AGENTS
───────────────────────────────────────── */

const AgentDB = {
  getAll:   () => _getAll('agents'),
  count:    () => _count('agents'),
  save:     (agent) => _put('agents', agent),
  saveMany: (agents) => _putMany('agents', agents),
  delete:   (id) => _delete('agents', id),
};

/* ─────────────────────────────────────────
   MIGRATION localStorage → IndexedDB
   Exécutée une seule fois au premier chargement
───────────────────────────────────────── */

async function migrateFromLocalStorage() {
  const migrated = localStorage.getItem('tf_db_migrated');
  if (migrated) return;

  console.log('[DB] Migration localStorage → IndexedDB...');

  // Migrer tickets de tous les utilisateurs connus
  const demoEmails = ['user@ticketflow.fr', 'admin@ticketflow.fr', 'agent@ticketflow.fr'];
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('tf_tickets_'));
  const emails  = [...new Set([...demoEmails, ...allKeys.map(k => k.replace('tf_tickets_', ''))])];

  for (const email of emails) {
    const raw = localStorage.getItem('tf_tickets_' + email);
    if (raw) {
      try {
        const tickets = JSON.parse(raw).map(t => ({ ...t, userEmail: t.userEmail || email }));
        await TicketDB.saveMany(tickets);
      } catch (e) { console.warn('[DB] Échec migration tickets pour', email, e); }
    }
  }

  // Migrer utilisateurs
  const rawUsers = localStorage.getItem('tf_admin_users');
  if (rawUsers) {
    try { await UserDB.saveMany(JSON.parse(rawUsers)); }
    catch (e) { console.warn('[DB] Échec migration users', e); }
  }

  // Migrer agents
  const rawAgents = localStorage.getItem('tf_admin_agents');
  if (rawAgents) {
    try { await AgentDB.saveMany(JSON.parse(rawAgents)); }
    catch (e) { console.warn('[DB] Échec migration agents', e); }
  }

  localStorage.setItem('tf_db_migrated', '1');
  console.log('[DB] Migration terminée ✓');
}

/* ─────────────────────────────────────────
   DONNÉES DE DÉMO
   Insère des données si la BDD est vide (premier lancement)
───────────────────────────────────────── */

async function seedDemoData() {
  const ticketCount = await TicketDB.count();
  if (ticketCount > 0) return; // déjà rempli

  console.log('[DB] Insertion des données de démo...');

  await TicketDB.saveMany([
    { id: 1, userEmail: 'user@ticketflow.fr', title: 'Impossible de me connecter à mon compte', category: 'Compte',     priority: 'eleve',   status: 'en_cours', date: '2026-03-28', desc: "Depuis ce matin, je n'arrive plus à accéder à mon compte malgré mon bon mot de passe.", messages: [{ from: 'agent', text: 'Bonjour, nous avons pris en charge votre ticket. Pouvez-vous nous donner plus de détails ?', time: '10:30' }] },
    { id: 2, userEmail: 'user@ticketflow.fr', title: 'Problème de facturation sur ma dernière facture', category: 'Facturation', priority: 'moyen',  status: 'ouvert',   date: '2026-03-30', desc: 'Ma facture du mois de mars ne correspond pas à mon abonnement Pro.', messages: [] },
    { id: 3, userEmail: 'user@ticketflow.fr', title: "Demande d'ajout d'une fonctionnalité", category: 'Commercial', priority: 'bas',     status: 'resolu',   date: '2026-03-15', desc: "Je souhaiterais avoir une option d'export CSV dans le tableau de bord.", messages: [{ from: 'agent', text: 'Cette fonctionnalité est disponible dans la version Pro. Merci de votre suggestion !', time: '14:20' }] },
    { id: 101, userEmail: 'client1@test.fr', title: 'Erreur 500 lors du paiement', category: 'Technique',   priority: 'critique', status: 'ouvert',   date: '2026-04-01', desc: 'Une erreur serveur survient à chaque tentative de paiement.', messages: [] },
    { id: 102, userEmail: 'client2@test.fr', title: 'Demande de remboursement',   category: 'Facturation', priority: 'eleve',   status: 'en_cours', date: '2026-03-31', desc: "J'ai été débité deux fois pour ma commande du 28 mars.", messages: [{ from: 'agent', text: 'Bonjour Pierre, nous avons transmis votre demande à la comptabilité.', time: '09:15' }] },
  ]);

  await UserDB.saveMany([
    { id: 1, name: 'Marie Durand',   email: 'marie@test.fr',  role: 'user',  createdAt: '2026-03-01' },
    { id: 2, name: 'Pierre Martin',  email: 'pierre@test.fr', role: 'user',  createdAt: '2026-03-05' },
    { id: 3, name: 'Sophie Bernard', email: 'sophie@test.fr', role: 'user',  createdAt: '2026-03-10' },
  ]);

  await AgentDB.saveMany([
    { id: 1, name: 'Agent Support',  email: 'agent@ticketflow.fr', specialty: 'Généraliste', tickets: 12, resolved: 9 },
    { id: 2, name: 'Alice Lefebvre', email: 'alice@ticketflow.fr', specialty: 'Technique',   tickets: 8,  resolved: 7 },
  ]);

  console.log('[DB] Données de démo insérées ✓');
}

/**
 * Point d'entrée : initialise la BDD, migre depuis localStorage si besoin, insère les démos.
 * À appeler au DOMContentLoaded de chaque dashboard.
 */
async function initDB() {
  await openDB();
  await migrateFromLocalStorage();
  await seedDemoData();
}
