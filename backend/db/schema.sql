CREATE DATABASE IF NOT EXISTS noticare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE noticare;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supabase_user_id VARCHAR(128) NULL,
  phone VARCHAR(32) NOT NULL,
  verified_at DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (phone),
  UNIQUE KEY uk_supabase_user_id (supabase_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS threat_matrix (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phrase TEXT NOT NULL,
  cleaned_phrase VARCHAR(512) NOT NULL,
  report_count INT UNSIGNED NOT NULL DEFAULT 1,
  unique_device_count INT UNSIGNED NOT NULL DEFAULT 1,
  base_score INT UNSIGNED NOT NULL DEFAULT 1,
  weighted_score DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  threat_level ENUM('High Threat','Low Threat','Safe') NOT NULL DEFAULT 'Safe',
  verified TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  first_seen DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cleaned_phrase (cleaned_phrase(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS phrase_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cleaned_phrase VARCHAR(512) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  report_count INT UNSIGNED NOT NULL DEFAULT 1,
  source_package VARCHAR(128) NULL,
  reported_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phrase_device (cleaned_phrase(255), device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
