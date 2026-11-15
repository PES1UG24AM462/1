-- SAM-NF-006: protect existing audit history from ordinary UPDATE and DELETE
-- statements. Run with the application database selected, for example:
--   mysql -u root -p student_attendance_db < database/migrations/20261115_audit_log_append_only.sql
--
-- Re-running this migration replaces the same triggers. Apply it using the
-- deployment database owner, never the application's runtime credentials.

DROP TRIGGER IF EXISTS trg_audit_log_prevent_update_sam_nf_006;
DROP TRIGGER IF EXISTS trg_audit_log_prevent_delete_sam_nf_006;

DELIMITER $$

CREATE TRIGGER trg_audit_log_prevent_update_sam_nf_006
BEFORE UPDATE ON audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_log records are append-only';
END$$

CREATE TRIGGER trg_audit_log_prevent_delete_sam_nf_006
BEFORE DELETE ON audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_log records are retained and cannot be deleted';
END$$

DELIMITER ;
