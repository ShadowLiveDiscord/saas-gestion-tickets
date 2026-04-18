<?php
/**
 * TicketFlow — Configuration MySQL (EXEMPLE)
 * Copiez ce fichier en config.php et remplissez vos vrais identifiants
 */

define('DB_HOST',     'localhost');      // toujours localhost sur hébergement mutualisé
define('DB_PORT',     '3306');
define('DB_NAME',     'votre_base');
define('DB_USER',     'votre_user');
define('DB_PASSWORD', 'votre_mdp');
define('DB_CHARSET',  'utf8mb4');

define('SESSION_TTL', 86400);           // 24h
define('BCRYPT_COST', 12);
