-- ============================================================
-- TicketFlow — Schéma MySQL pour phpMyAdmin
-- Base : ticketflow  |  User : ticketflow
--
-- Instructions :
--   1. Ouvrez phpMyAdmin sur lordhosting
--   2. Sélectionnez la base "ticketflow" dans le panneau gauche
--   3. Cliquez sur "SQL" dans le menu du haut
--   4. Copiez-collez tout ce fichier et cliquez "Exécuter"
-- ============================================================

-- ─── TABLE users ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  password   VARCHAR(255)  NOT NULL,
  role       ENUM('admin','agent','user') NOT NULL DEFAULT 'user',
  company    VARCHAR(150)  DEFAULT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── TABLE tickets ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(250)  NOT NULL,
  description TEXT          DEFAULT NULL,
  status      ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  priority    ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  category    VARCHAR(100)  DEFAULT 'Général',
  user_id     INT           DEFAULT NULL,
  agent_id    INT           DEFAULT NULL,
  reply       TEXT          DEFAULT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status   (status),
  INDEX idx_priority (priority),
  INDEX idx_user     (user_id),
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── TABLE sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(64)   NOT NULL PRIMARY KEY,
  user_id    INT           NOT NULL,
  email      VARCHAR(150)  NOT NULL,
  role       VARCHAR(20)   NOT NULL,
  expires_at DATETIME      NOT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── COMPTES DÉMO (mots de passe hashés bcrypt) ──────────────
-- admin123  →  $2y$12$...
-- agent123  →  $2y$12$...
-- user123   →  $2y$12$...
-- Ces hashes sont pré-calculés avec cost=12

INSERT IGNORE INTO users (name, email, password, role) VALUES
  ('Admin TicketFlow', 'admin@ticketflow.fr',
   '$2y$12$sNRLylsRF9G7YQB6LUrFpOS/3RnO416Mim8QyS9CIu88YRmq5py0W', 'admin'),
  ('Agent Support',    'agent@ticketflow.fr',
   '$2y$12$rNBTYtMxQCtstJsdNk4DHeRqSoOWPrRsPpVVOHxssRWEzNylJbRni', 'agent'),
  ('Jean Dupont',      'user@ticketflow.fr',
   '$2y$12$BCwuRn7pPcDcNH5PDBJ5P.8EO77IZjMGqhIybGE3MkNOyTBW0MY9m', 'user');

-- ─── TICKETS DÉMO ────────────────────────────────────────────
INSERT IGNORE INTO tickets (id, title, description, status, priority, category, user_id)
SELECT 1, 'Impossible de me connecter', 'Depuis ce matin je n\'arrive plus à accéder à mon compte.',
       'in_progress', 'high', 'Compte', u.id
FROM users u WHERE u.email = 'user@ticketflow.fr'
LIMIT 1;

INSERT IGNORE INTO tickets (id, title, description, status, priority, category, user_id)
SELECT 2, 'Problème de facturation', 'Ma facture de mars ne correspond pas à mon abonnement Pro.',
       'open', 'medium', 'Facturation', u.id
FROM users u WHERE u.email = 'user@ticketflow.fr'
LIMIT 1;

INSERT IGNORE INTO tickets (id, title, description, status, priority, category, user_id)
SELECT 3, 'Demande d\'export CSV', 'Je souhaiterais pouvoir exporter mes tickets en CSV.',
       'closed', 'low', 'Amélioration', u.id
FROM users u WHERE u.email = 'user@ticketflow.fr'
LIMIT 1;
