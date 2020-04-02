ALTER TABLE `VehicleInfo` ADD `model` VARCHAR(255) NULL AFTER `name`;

EXIT -- ROLLBACK

ALTER TABLE `VehicleInfo` DROP COLUMN `model`;
