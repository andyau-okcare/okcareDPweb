CREATE DATABASE IF NOT EXISTS `ccsv_system`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ccsv_system`;

CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` LONGTEXT NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

SHOW TABLES LIKE 'system_settings';
