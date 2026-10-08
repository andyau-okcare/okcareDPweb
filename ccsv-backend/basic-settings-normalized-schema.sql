-- Run service-fees-schema.sql first. This migration keeps the old JSON table as
-- system_settings_legacy and creates editable relational settings tables.
-- Existing Basic JSON is copied once; the legacy table is retained as backup.

CREATE DATABASE IF NOT EXISTS `ccsv_system`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ccsv_system`;

SET @legacy_settings_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'system_settings'
     AND COLUMN_NAME = 'setting_value'
);
SET @legacy_archive_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'system_settings_legacy'
);
SET @archive_legacy_settings_sql = IF(
  @legacy_settings_exists = 1 AND @legacy_archive_exists = 0,
  'RENAME TABLE `system_settings` TO `system_settings_legacy`',
  'SELECT 1'
);
PREPARE archive_legacy_settings_statement FROM @archive_legacy_settings_sql;
EXECUTE archive_legacy_settings_statement;
DEALLOCATE PREPARE archive_legacy_settings_statement;

CREATE TABLE IF NOT EXISTS `system_settings` (
  `settings_id` TINYINT UNSIGNED NOT NULL,
  `normal_start` TIME NOT NULL DEFAULT '09:00:00',
  `normal_end` TIME NOT NULL DEFAULT '18:00:00',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`settings_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_settings_legacy` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` LONGTEXT NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `basic_caregivers` (
  `caregiver_code` VARCHAR(50) NOT NULL,
  `caregiver_name` VARCHAR(150) NOT NULL,
  `hourly_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`caregiver_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `basic_meal_caregivers` (
  `caregiver_code` VARCHAR(50) NOT NULL,
  `caregiver_name` VARCHAR(150) NOT NULL,
  `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`caregiver_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `basic_holidays` (
  `holiday_date` DATE NOT NULL,
  PRIMARY KEY (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `basic_settings_migrations` (
  `migration_key` VARCHAR(100) NOT NULL,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `migrate_basic_settings_json`;

DELIMITER //
CREATE PROCEDURE `migrate_basic_settings_json`()
BEGIN
  DECLARE settings_json LONGTEXT DEFAULT NULL;
  DECLARE item_index INT DEFAULT 0;
  DECLARE item_count INT DEFAULT 0;
  DECLARE item_code VARCHAR(50);
  DECLARE item_name VARCHAR(150);
  DECLARE item_fee DECIMAL(10,2);
  DECLARE item_caregiver_fee DECIMAL(10,2);
  DECLARE item_professional VARCHAR(120);
  DECLARE item_meal_included TINYINT(1);
  DECLARE holiday_text VARCHAR(20);

  IF NOT EXISTS (
    SELECT 1 FROM `basic_settings_migrations`
     WHERE `migration_key` = 'system_settings_json_to_relational_v1'
  ) THEN
    SELECT `setting_value`
      INTO settings_json
      FROM `system_settings_legacy`
     WHERE `setting_key` = 'basic'
     LIMIT 1;

    IF settings_json IS NOT NULL AND NOT JSON_VALID(settings_json) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Legacy Basic settings contain invalid JSON; fix or back up this row before migrating.';
    END IF;

    IF settings_json IS NOT NULL THEN
      INSERT IGNORE INTO `system_settings` (`settings_id`, `normal_start`, `normal_end`)
      VALUES (
        1,
        COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.normalStart')), ''), '09:00:00'),
        COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.normalEnd')), ''), '18:00:00')
      );

      SET item_index = 0;
      SET item_count = COALESCE(JSON_LENGTH(JSON_EXTRACT(settings_json, '$.services')), 0);
      WHILE item_index < item_count DO
        SET item_code = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].code')
        ))), '');
        SET item_name = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].name')
        ))), '');
        SET item_professional = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].serviceProfessional')
        )), '');
        SET item_fee = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].serviceFee')
        )), ''), 0);
        SET item_caregiver_fee = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].caregiverFee')
        )), ''), 0);
        SET item_meal_included = IF(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.services[', item_index, '].mealIncluded')
        )) IN ('true', '1'), 1, 0);
        IF item_code IS NOT NULL AND item_name IS NOT NULL THEN
          INSERT INTO `service_fees`
            (`service_code`, `service_name`, `service_professional`, `service_fee`,
             `caregiver_fee`, `meal_included`, `display_order`)
          VALUES (UPPER(item_code), item_name, item_professional, item_fee,
                  item_caregiver_fee, item_meal_included, item_index)
          ON DUPLICATE KEY UPDATE
            `service_name` = VALUES(`service_name`),
            `service_professional` = VALUES(`service_professional`),
            `service_fee` = VALUES(`service_fee`),
            `caregiver_fee` = VALUES(`caregiver_fee`),
            `meal_included` = VALUES(`meal_included`),
            `display_order` = VALUES(`display_order`);
        END IF;
        SET item_index = item_index + 1;
      END WHILE;

      SET item_index = 0;
      SET item_count = COALESCE(JSON_LENGTH(JSON_EXTRACT(settings_json, '$.caregivers')), 0);
      WHILE item_index < item_count DO
        SET item_code = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.caregivers[', item_index, '].code')
        ))), '');
        SET item_name = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.caregivers[', item_index, '].name')
        ))), '');
        SET item_fee = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.caregivers[', item_index, '].hourlyFee')
        )), ''), 0);
        IF item_code IS NOT NULL AND item_name IS NOT NULL THEN
          INSERT IGNORE INTO `basic_caregivers`
            (`caregiver_code`, `caregiver_name`, `hourly_fee`, `display_order`)
          VALUES (item_code, item_name, item_fee, item_index);
        END IF;
        SET item_index = item_index + 1;
      END WHILE;

      SET item_index = 0;
      SET item_count = COALESCE(JSON_LENGTH(JSON_EXTRACT(settings_json, '$.mealCaregivers')), 0);
      WHILE item_index < item_count DO
        SET item_code = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.mealCaregivers[', item_index, '].code')
        ))), '');
        SET item_name = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.mealCaregivers[', item_index, '].name')
        ))), '');
        IF item_code IS NOT NULL AND item_name IS NOT NULL THEN
          INSERT IGNORE INTO `basic_meal_caregivers`
            (`caregiver_code`, `caregiver_name`, `display_order`)
          VALUES (item_code, item_name, item_index);
        END IF;
        SET item_index = item_index + 1;
      END WHILE;

      SET item_index = 0;
      SET item_count = COALESCE(JSON_LENGTH(JSON_EXTRACT(settings_json, '$.holidays')), 0);
      WHILE item_index < item_count DO
        SET holiday_text = JSON_UNQUOTE(JSON_EXTRACT(
          settings_json, CONCAT('$.holidays[', item_index, ']')
        ));
        IF holiday_text REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          INSERT IGNORE INTO `basic_holidays` (`holiday_date`)
          VALUES (STR_TO_DATE(holiday_text, '%Y-%m-%d'));
        END IF;
        SET item_index = item_index + 1;
      END WHILE;
    END IF;

    INSERT INTO `basic_settings_migrations` (`migration_key`)
    VALUES ('system_settings_json_to_relational_v1');
  END IF;
END//
DELIMITER ;

CALL `migrate_basic_settings_json`();
DROP PROCEDURE `migrate_basic_settings_json`;

SELECT `settings_id`, `normal_start`, `normal_end` FROM `system_settings`;
SELECT `caregiver_code`, `caregiver_name`, `hourly_fee`, `display_order`
  FROM `basic_caregivers` ORDER BY `display_order`, `caregiver_code`;
SELECT `caregiver_code`, `caregiver_name`, `display_order`
  FROM `basic_meal_caregivers` ORDER BY `display_order`, `caregiver_code`;
SELECT `holiday_date` FROM `basic_holidays` ORDER BY `holiday_date`;
SELECT `service_code`, `service_name`, `service_professional`, `service_fee`, `caregiver_fee`, `meal_included`, `display_order`
  FROM `service_fees` ORDER BY `display_order`, `service_code`;
