USE `ccsv_system`;

ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `pic` VARCHAR(50) NOT NULL DEFAULT 'ET';

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `caregiver_id` VARCHAR(50) DEFAULT NULL COMMENT 'Stores caregiver_code',
  `service_type_id` VARCHAR(20) DEFAULT NULL COMMENT 'Stores service_fees.service_code',
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME NOT NULL,
  `is_overtime` TINYINT(1) NOT NULL DEFAULT 0,
  `remarks` TEXT DEFAULT NULL,
  `service_type` VARCHAR(120) NOT NULL DEFAULT '',
  `provider_type` VARCHAR(100) NOT NULL DEFAULT '',
  `caregiver_code` VARCHAR(50) NOT NULL DEFAULT '',
  `caregiver_name` VARCHAR(150) NOT NULL DEFAULT '',
  `includes_meal` TINYINT(1) NOT NULL DEFAULT 0,
  `meal_count` TINYINT UNSIGNED DEFAULT NULL,
  `soft_meal` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_bookings_client_id` (`client_id`),
  KEY `idx_bookings_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `bookings`
  ADD COLUMN IF NOT EXISTS `service_type` VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `provider_type` VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `caregiver_code` VARCHAR(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `caregiver_name` VARCHAR(150) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `includes_meal` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `meal_count` TINYINT UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `soft_meal` TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE `bookings`
  MODIFY COLUMN `caregiver_id` VARCHAR(50) DEFAULT NULL COMMENT 'Stores caregiver_code',
  MODIFY COLUMN `service_type_id` VARCHAR(20) DEFAULT NULL COMMENT 'Stores service_fees.service_code';

CREATE TABLE IF NOT EXISTS `service_colors` (
  `service_code` VARCHAR(20) NOT NULL,
  `service_type` VARCHAR(120) NOT NULL,
  `color` CHAR(7) NOT NULL DEFAULT '#DBEAFE',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_code`, `service_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `service_colors`
  ADD COLUMN IF NOT EXISTS `service_type` VARCHAR(120) NOT NULL DEFAULT '';

ALTER TABLE `service_colors`
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`service_code`, `service_type`);

CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` LONGTEXT NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `service_fees` (
  `service_code` VARCHAR(20) NOT NULL,
  `service_name` VARCHAR(120) NOT NULL,
  `service_professional` VARCHAR(120) NOT NULL DEFAULT '',
  `service_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `caregiver_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `meal_included` TINYINT(1) NOT NULL DEFAULT 0,
  `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`service_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @service_professional_column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_fees'
    AND COLUMN_NAME = 'service_professional'
);
SET @service_professional_ddl = IF(
  @service_professional_column_exists = 0,
  CONCAT(
    'ALTER TABLE `service_fees` ADD COLUMN `service_professional` VARCHAR(120) NOT NULL DEFAULT ',
    CHAR(39), CHAR(39),
    ' AFTER `service_name`'
  ),
  'SELECT 1'
);
PREPARE service_professional_statement FROM @service_professional_ddl;
EXECUTE service_professional_statement;
DEALLOCATE PREPARE service_professional_statement;

ALTER TABLE `service_fees`
  MODIFY COLUMN `service_professional` VARCHAR(120) NOT NULL DEFAULT '';

INSERT INTO `service_fees`
  (`service_code`, `service_name`, `service_professional`, `service_fee`, `caregiver_fee`, `meal_included`, `display_order`)
VALUES
  ('PT', '物理治療師(PT)', '專業人員', 0.00, 0.00, 0, 1),
  ('OT', '職業治療師(OT)', '專業人員', 0.00, 0.00, 0, 2),
  ('ST', '語言治療師(ST)', '專業人員', 0.00, 0.00, 0, 3),
  ('RN', '註冊護士(RN)', '專業人員', 0.00, 0.00, 0, 4),
  ('EN', '登記護士(EN)', '專業人員', 0.00, 0.00, 0, 5),
  ('PTA', '物理治療助理(PTA)', '輔助人員', 0.00, 0.00, 0, 6),
  ('OTA', '職業治療助理(OTA)', '輔助人員', 0.00, 0.00, 0, 7),
  ('PCW', '護理員(PCW)', '輔助人員', 0.00, 0.00, 0, 8),
  ('HW', '保健員(HW)', '輔助人員', 0.00, 0.00, 0, 9),
  ('HP', '家務助理(HP)', '輔助人員', 0.00, 0.00, 0, 10),
  ('HEP', '輔助產品(HEP)', '輔助產品', 0.00, 0.00, 0, 12),
  ('MEAL', '膳食(MEAL)', '', 0.00, 0.00, 0, 11)
ON DUPLICATE KEY UPDATE
  `service_name` = VALUES(`service_name`),
  `service_professional` = VALUES(`service_professional`),
  `meal_included` = VALUES(`meal_included`),
  `display_order` = VALUES(`display_order`);

UPDATE `bookings` AS b
LEFT JOIN `service_fees` AS sf
  ON UPPER(sf.`service_code`) = UPPER(b.`service_type`)
  OR LOWER(sf.`service_name`) = LOWER(b.`service_type`)
SET
  b.`caregiver_id` = NULLIF(b.`caregiver_code`, ''),
  b.`service_type_id` = sf.`service_code`,
  b.`service_type` = COALESCE(sf.`service_name`, b.`service_type`);
