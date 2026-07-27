CREATE TABLE tag_permissions (
  id VARCHAR(64) PRIMARY KEY,
  tag_key VARCHAR(128) NOT NULL,
  action VARCHAR(255) NOT NULL,
  resource VARCHAR(128) NOT NULL,
  effect ENUM('allow', 'deny') NOT NULL,
  status VARCHAR(32) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  scope_type VARCHAR(64) NOT NULL,
  scope_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_tag_permission (tag_key, action, resource, scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //
CREATE PROCEDURE validate_production_governance()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM role_permissions rp
    LEFT JOIN roles r ON r.role_key = rp.role_key
    LEFT JOIN permissions p ON p.action = rp.action AND p.resource = rp.resource
    WHERE r.role_key IS NULL OR p.id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orphan role_permissions rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM role_assignments ra
    LEFT JOIN subjects s ON s.uid = ra.subject_uid
    LEFT JOIN roles r ON r.role_key = ra.role_key
    WHERE s.uid IS NULL OR r.role_key IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orphan role_assignments rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tag_permissions tp
    LEFT JOIN tag_definitions td ON td.tag_key = tp.tag_key
    LEFT JOIN permissions p ON p.action = tp.action AND p.resource = tp.resource
    WHERE td.tag_key IS NULL OR p.id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orphan tag_permissions rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tag_assignments ta
    LEFT JOIN subjects s ON s.uid = ta.subject_uid
    LEFT JOIN tag_definitions td ON td.tag_key = ta.tag_key
    WHERE s.uid IS NULL OR td.tag_key IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orphan tag_assignments rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM module_owners mo
    LEFT JOIN modules m ON m.module_id = mo.module_id
    WHERE m.module_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orphan module_owners rows';
  END IF;
END//
DELIMITER ;

CALL validate_production_governance();
DROP PROCEDURE validate_production_governance;

ALTER TABLE role_permissions
  ADD CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_key) REFERENCES roles(role_key),
  ADD CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (action, resource) REFERENCES permissions(action, resource);

ALTER TABLE role_assignments
  ADD CONSTRAINT fk_role_assignments_subject
    FOREIGN KEY (subject_uid) REFERENCES subjects(uid),
  ADD CONSTRAINT fk_role_assignments_role
    FOREIGN KEY (role_key) REFERENCES roles(role_key);

ALTER TABLE tag_permissions
  ADD CONSTRAINT fk_tag_permissions_tag
    FOREIGN KEY (tag_key) REFERENCES tag_definitions(tag_key),
  ADD CONSTRAINT fk_tag_permissions_permission
    FOREIGN KEY (action, resource) REFERENCES permissions(action, resource);

ALTER TABLE tag_assignments
  ADD CONSTRAINT fk_tag_assignments_subject
    FOREIGN KEY (subject_uid) REFERENCES subjects(uid),
  ADD CONSTRAINT fk_tag_assignments_tag
    FOREIGN KEY (tag_key) REFERENCES tag_definitions(tag_key);

ALTER TABLE module_owners
  ADD CONSTRAINT fk_module_owners_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id);
