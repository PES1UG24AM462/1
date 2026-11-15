# Audit record retention (SAM-NF-006)

## Approved requirement and traceability

The SRS states: “The system shall retain audit records for at least one academic year or the configured institutional retention period.” Its acceptance criterion is that audit records remain retrievable for the configured period, tested by **TC-AUD-02**. The STP repeats TC-AUD-02. The RTM ties this requirement to scheduled backups and a verified recovery process (TC-REC-01).

The documents do not identify an institution-specific duration, define an academic-year start/end date, or require archival. Issue #54 also calls for confirmation of the applicable institutional policy. The implementation therefore does not translate an academic year into an invented number of days and does not enable expiration or deletion. Until an authorized policy is supplied, rows remain in the live audit table indefinitely. This exceeds the stated minimum without discarding history.

## Retention behavior

- All event categories share `audit_log`: attendance submissions and corrections, authentication events, user and academic administration changes, enrollment changes, and report/export events.
- `created_at` is the retention origin because the approved documents specify no other event. The backend/database generate UTC timestamps. Attendance corrections reuse the database-generated UTC correction timestamp so the audit entry corresponds to the corrected attendance row.
- Audit history remains available through the existing administrator-only, paginated `GET /api/admin/audit-logs` endpoint. It applies no age cutoff.
- The table has no foreign keys to business records, so deleting or changing a user, course, class, student, or enrollment cannot cascade into the audit history.
- The migration installs database triggers that reject all `UPDATE` and `DELETE` statements against audit rows. There is no application deletion endpoint or cleanup job. A database owner could intentionally remove a trigger; restrict migration and schema privileges to trusted operators.
- No extra expiry or archival fields are needed while records are retained indefinitely. No archival requirement appears in the approved documents.

## Installation and backups

For a new database, apply `database/schema.sql`, then install the append-only guards:

```sh
mysql -u root -p < database/schema.sql
mysql -u root -p student_attendance_db < database/migrations/20261115_audit_log_append_only.sql
```

For an existing database, apply the migration once using a deployment database owner. The runtime application credentials should not own or alter these triggers. The migration can be re-run to restore the guards if an operator has intentionally removed them.

The existing backup script dumps the database including triggers and retains the last seven generated backup files by default. Each full database dump includes the current audit history; restoring it must be followed by the existing database integrity checks. The example configuration documents a daily cron schedule, but scheduling and successful recovery tests remain deployment responsibilities.

## Policy dependency

The institution must confirm the configured retention period and how an academic year is defined. Once approved, that policy can be documented and any future expiry workflow reviewed against it. Until then, keep automatic cleanup disabled. Do not set a guessed `AUDIT_RETENTION_DAYS` value or add a cleanup schedule.
