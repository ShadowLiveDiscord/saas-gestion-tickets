<?php
/**
 * TicketFlow — API PHP
 * Compatible hébergement mutualisé (lordhosting, o2switch, etc.)
 * Routes identiques au serveur Node.js précédent
 */

require_once __DIR__ . '/config.php';

// ─── CORS ───────────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Session-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── PDO ────────────────────────────────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        jsonError(503, 'Connexion base de données échouée : ' . $e->getMessage());
    }
    return $pdo;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function jsonOk(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}
function jsonError(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}
function body(): array {
    $raw = file_get_contents('php://input');
    return $raw ? (json_decode($raw, true) ?? []) : [];
}
function token(): ?string {
    return $_SERVER['HTTP_X_SESSION_TOKEN'] ?? null;
}
function genToken(): string {
    return bin2hex(random_bytes(32));
}

// ─── Init schéma ─────────────────────────────────────────────────────────────
function initSchema(): void {
    $db = getDB();
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(100) NOT NULL,
            email      VARCHAR(150) NOT NULL UNIQUE,
            password   VARCHAR(255) NOT NULL,
            role       ENUM('admin','agent','user') DEFAULT 'user',
            company    VARCHAR(150),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS tickets (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            title       VARCHAR(250) NOT NULL,
            description TEXT,
            status      ENUM('open','in_progress','closed') DEFAULT 'open',
            priority    ENUM('low','medium','high','critical') DEFAULT 'medium',
            category    VARCHAR(100),
            user_id     INT,
            agent_id    INT,
            reply       TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS sessions (
            token      VARCHAR(64) PRIMARY KEY,
            user_id    INT NOT NULL,
            email      VARCHAR(150) NOT NULL,
            role       VARCHAR(20) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
}

function seedDemo(): void {
    $db = getDB();
    $count = (int) $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($count > 0) return;

    $demos = [
        ['Admin TicketFlow', 'admin@ticketflow.fr',  'admin123',  'admin'],
        ['Agent Support',    'agent@ticketflow.fr',  'agent123',  'agent'],
        ['Jean Dupont',      'user@ticketflow.fr',   'user123',   'user'],
    ];
    $stmt = $db->prepare("INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)");
    foreach ($demos as [$name, $email, $pass, $role]) {
        $stmt->execute([$name, $email, password_hash($pass, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]), $role]);
    }

    // tickets démo
    $adminId = (int) $db->lastInsertId() - 2; // approximation, on re-fetch
    $adminId = (int) $db->query("SELECT id FROM users WHERE email='admin@ticketflow.fr'")->fetchColumn();
    $userId  = (int) $db->query("SELECT id FROM users WHERE email='user@ticketflow.fr'")->fetchColumn();
    $agentId = (int) $db->query("SELECT id FROM users WHERE email='agent@ticketflow.fr'")->fetchColumn();

    $tStmt = $db->prepare("INSERT INTO tickets (title, description, status, priority, category, user_id, agent_id) VALUES (?,?,?,?,?,?,?)");
    $tStmt->execute(['Problème de connexion', 'Impossible de me connecter depuis hier.', 'open',        'high',   'Technique',    $userId, $agentId]);
    $tStmt->execute(['Facture incorrecte',    'Ma facture du mois ne correspond pas.', 'in_progress', 'medium', 'Facturation',  $userId, $agentId]);
    $tStmt->execute(['Demande de fonctionnalité', 'Ajouter export CSV.',               'closed',      'low',    'Amélioration', $userId, null]);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireSession(): array {
    $tok = token();
    if (!$tok) jsonError(401, 'Token manquant');
    $db   = getDB();
    $stmt = $db->prepare("SELECT s.*, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > NOW()");
    $stmt->execute([$tok]);
    $sess = $stmt->fetch();
    if (!$sess) jsonError(401, 'Session invalide ou expirée');
    return $sess;
}
function requireAdmin(): array {
    $sess = requireSession();
    if ($sess['role'] !== 'admin') jsonError(403, 'Accès réservé aux administrateurs');
    return $sess;
}

// ─── Routeur ─────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Normaliser : enlever préfixe /api ou /ticketflow/api etc.
$uri = preg_replace('#^.*/api#', '', $uri);
$uri = rtrim($uri, '/') ?: '/';
$parts = explode('/', ltrim($uri, '/'));

$route  = implode('/', array_slice($parts, 0, 2));   // ex: auth/login
$itemId = isset($parts[2]) ? (int)$parts[2] : null;  // ex: tickets/42

try {
    initSchema();
    seedDemo();
} catch (Throwable $e) {
    jsonError(500, 'Erreur init : ' . $e->getMessage());
}

// ════════════════════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════════════════════
if ($uri === '/health' && $method === 'GET') {
    try { getDB(); jsonOk(['status' => 'ok', 'db' => 'connected']); }
    catch (Throwable) { jsonError(503, 'DB unreachable'); }
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
if ($route === 'auth/login' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    $pass  = $b['password'] ?? '';
    if (!$email || !$pass) jsonError(400, 'Email et mot de passe requis');

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE email=?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($pass, $user['password']))
        jsonError(401, 'Email ou mot de passe incorrect');

    $tok     = genToken();
    $expires = date('Y-m-d H:i:s', time() + SESSION_TTL);
    $db->prepare("INSERT INTO sessions (token, user_id, email, role, expires_at) VALUES (?,?,?,?,?)")
       ->execute([$tok, $user['id'], $user['email'], $user['role'], $expires]);

    jsonOk([
        'token'   => $tok,
        'user'    => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role'], 'company' => $user['company']],
        'expires' => $expires,
    ]);
}

if ($route === 'auth/register' && $method === 'POST') {
    $b = body();
    $name    = trim($b['name']     ?? '');
    $email   = strtolower(trim($b['email']    ?? ''));
    $pass    = $b['password'] ?? '';
    $role    = in_array($b['role'] ?? '', ['admin','agent','user']) ? $b['role'] : 'user';
    $company = trim($b['company']  ?? '');
    if (!$name || !$email || !$pass) jsonError(400, 'Nom, email et mot de passe requis');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError(400, 'Email invalide');
    if (strlen($pass) < 8) jsonError(400, 'Mot de passe trop court (8 car. minimum)');

    $db = getDB();
    if ($db->prepare("SELECT id FROM users WHERE email=?")->execute([$email]) &&
        $db->query("SELECT id FROM users WHERE email='$email'")->fetch())
        jsonError(409, 'Email déjà utilisé');

    $db->prepare("INSERT INTO users (name, email, password, role, company) VALUES (?,?,?,?,?)")
       ->execute([$name, $email, password_hash($pass, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]), $role, $company ?: null]);
    $userId = (int)$db->lastInsertId();

    $tok     = genToken();
    $expires = date('Y-m-d H:i:s', time() + SESSION_TTL);
    $db->prepare("INSERT INTO sessions (token, user_id, email, role, expires_at) VALUES (?,?,?,?,?)")
       ->execute([$tok, $userId, $email, $role, $expires]);

    jsonOk(['token' => $tok, 'user' => ['id' => $userId, 'name' => $name, 'email' => $email, 'role' => $role]], 201);
}

if ($route === 'auth/logout' && $method === 'POST') {
    $tok = token();
    if ($tok) getDB()->prepare("DELETE FROM sessions WHERE token=?")->execute([$tok]);
    jsonOk(['message' => 'Déconnecté']);
}

if ($route === 'auth/session' && $method === 'GET') {
    $sess = requireSession();
    $user = getDB()->prepare("SELECT id,name,email,role,company FROM users WHERE id=?");
    $user->execute([$sess['user_id']]);
    jsonOk(['user' => $user->fetch(), 'expires' => $sess['expires_at']]);
}

// ════════════════════════════════════════════════════════════════════════════
// TICKETS
// ════════════════════════════════════════════════════════════════════════════
if ($parts[0] === 'tickets') {
    $sess = requireSession();
    $db   = getDB();

    if ($method === 'GET' && !$itemId) {
        if ($sess['role'] === 'user') {
            $stmt = $db->prepare("SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC");
            $stmt->execute([$sess['user_id']]);
        } else {
            $stmt = $db->query("SELECT t.*, u.name AS user_name FROM tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC");
        }
        jsonOk($stmt->fetchAll());
    }

    if ($method === 'GET' && $itemId) {
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id=?");
        $stmt->execute([$itemId]);
        $t = $stmt->fetch();
        if (!$t) jsonError(404, 'Ticket introuvable');
        if ($sess['role'] === 'user' && $t['user_id'] != $sess['user_id']) jsonError(403, 'Accès refusé');
        jsonOk($t);
    }

    if ($method === 'POST') {
        $b = body();
        $title    = trim($b['title'] ?? '');
        $desc     = trim($b['description'] ?? '');
        $priority = in_array($b['priority'] ?? '', ['low','medium','high','critical']) ? $b['priority'] : 'medium';
        $category = trim($b['category'] ?? 'Général');
        if (!$title) jsonError(400, 'Titre requis');
        $stmt = $db->prepare("INSERT INTO tickets (title, description, priority, category, user_id) VALUES (?,?,?,?,?)");
        $stmt->execute([$title, $desc, $priority, $category, $sess['user_id']]);
        $id = (int)$db->lastInsertId();
        $row = $db->prepare("SELECT * FROM tickets WHERE id=?");
        $row->execute([$id]);
        jsonOk($row->fetch(), 201);
    }

    if ($method === 'PUT' && $itemId) {
        $b    = body();
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id=?");
        $stmt->execute([$itemId]);
        $t = $stmt->fetch();
        if (!$t) jsonError(404, 'Ticket introuvable');
        if ($sess['role'] === 'user' && $t['user_id'] != $sess['user_id']) jsonError(403, 'Accès refusé');

        $fields = [];
        $vals   = [];
        $allowed = ['title','description','status','priority','category','reply','agent_id'];
        foreach ($allowed as $f) {
            if (isset($b[$f])) { $fields[] = "$f=?"; $vals[] = $b[$f]; }
        }
        if (!$fields) jsonError(400, 'Aucune donnée à mettre à jour');
        $vals[] = $itemId;
        $db->prepare("UPDATE tickets SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        $row = $db->prepare("SELECT * FROM tickets WHERE id=?");
        $row->execute([$itemId]);
        jsonOk($row->fetch());
    }

    if ($method === 'DELETE' && $itemId) {
        requireAdmin();
        $db->prepare("DELETE FROM tickets WHERE id=?")->execute([$itemId]);
        jsonOk(['message' => 'Ticket supprimé']);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// USERS (admin seulement)
// ════════════════════════════════════════════════════════════════════════════
if ($parts[0] === 'users') {
    requireAdmin();
    $db = getDB();

    if ($method === 'GET' && !$itemId) {
        $role = $_GET['role'] ?? null;
        if ($role) {
            $stmt = $db->prepare("SELECT id,name,email,role,company,created_at FROM users WHERE role=? ORDER BY name");
            $stmt->execute([$role]);
        } else {
            $stmt = $db->query("SELECT id,name,email,role,company,created_at FROM users ORDER BY name");
        }
        jsonOk($stmt->fetchAll());
    }

    if ($method === 'GET' && $itemId) {
        $stmt = $db->prepare("SELECT id,name,email,role,company,created_at FROM users WHERE id=?");
        $stmt->execute([$itemId]);
        $u = $stmt->fetch();
        if (!$u) jsonError(404, 'Utilisateur introuvable');
        jsonOk($u);
    }

    if ($method === 'POST') {
        $b = body();
        $name  = trim($b['name']  ?? '');
        $email = strtolower(trim($b['email'] ?? ''));
        $pass  = $b['password'] ?? '';
        $role  = in_array($b['role'] ?? '', ['admin','agent','user']) ? $b['role'] : 'user';
        if (!$name || !$email || !$pass) jsonError(400, 'Nom, email et mot de passe requis');
        $db->prepare("INSERT INTO users (name, email, password, role, company) VALUES (?,?,?,?,?)")
           ->execute([$name, $email, password_hash($pass, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]), $role, $b['company'] ?? null]);
        jsonOk(['id' => (int)$db->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => $role], 201);
    }

    if ($method === 'PUT' && $itemId) {
        $b = body();
        $fields = []; $vals = [];
        foreach (['name','email','role','company'] as $f) {
            if (isset($b[$f])) { $fields[] = "$f=?"; $vals[] = $b[$f]; }
        }
        if (isset($b['password']) && $b['password']) {
            $fields[] = "password=?";
            $vals[]   = password_hash($b['password'], PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
        }
        if (!$fields) jsonError(400, 'Aucune donnée');
        $vals[] = $itemId;
        $db->prepare("UPDATE users SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        jsonOk(['message' => 'Mis à jour']);
    }

    if ($method === 'DELETE' && $itemId) {
        $db->prepare("DELETE FROM users WHERE id=?")->execute([$itemId]);
        jsonOk(['message' => 'Utilisateur supprimé']);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// AGENTS  (alias users avec role=agent, admin seulement)
// ════════════════════════════════════════════════════════════════════════════
if ($parts[0] === 'agents') {
    requireAdmin();
    $db = getDB();

    if ($method === 'GET' && !$itemId) {
        $stmt = $db->query("SELECT id,name,email,role,company,created_at FROM users WHERE role='agent' ORDER BY name");
        jsonOk($stmt->fetchAll());
    }
    if ($method === 'POST') {
        $b = body();
        $name  = trim($b['name']  ?? '');
        $email = strtolower(trim($b['email'] ?? ''));
        $pass  = $b['password'] ?? 'Agent123!';
        if (!$name || !$email) jsonError(400, 'Nom et email requis');
        $db->prepare("INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)")
           ->execute([$name, $email, password_hash($pass, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]), 'agent']);
        jsonOk(['id' => (int)$db->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => 'agent'], 201);
    }
    if ($method === 'DELETE' && $itemId) {
        $db->prepare("DELETE FROM users WHERE id=? AND role='agent'")->execute([$itemId]);
        jsonOk(['message' => 'Agent supprimé']);
    }
}

// ─── Route inconnue ───────────────────────────────────────────────────────────
jsonError(404, "Route inconnue : $method $uri");
