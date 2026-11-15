# Security event audit trail (SAM-SR-004)

## Requirement traceability

Issue #39 / SAMSR-004 states: “The system shall record security-relevant login failures, attendance corrections, and administrative changes in an audit log.” **AC-SAM-SR-004** requires actor, action, target, and timestamp. The Test Plan identifies **TC-AUD-01**: “Attendance corrections and administrative/security events record actor, action, target, and timestamp.” Related requirements are SAM-F-007, SAM-F-016, and SAM-NF-006.

There is a source identifier discrepancy: issue #39 and the implementation task identify SAM-SR-004 (also written SAMSR-004), while the SRS PDF table at §5.1.2 labels the row containing this requirement SAM-SR-005. This implementation follows issue #39 and does not alter the approved SRS.

## Existing audit store and event coverage

The system uses the existing `audit_log` table and `auditModel.logEvent`; this change does not create a second audit system.

- **Failed login:** `LOGIN_FAILED`; records the attempted identifier only when it matches the registered username format, otherwise leaves actor null. The target is an account ID or the fixed `auth/login` endpoint, with failure category/outcome, server-generated request ID, transport peer IP, and database-generated UTC timestamp. Passwords, hashes, tokens, and unrelated request fields are excluded. Unknown-account and incorrect-password responses remain generic.
- **Attendance correction:** the existing `ATTENDANCE_CORRECTION` event records the authenticated faculty actor, attendance target, previous and updated status, and the same database-generated UTC timestamp used for the correction. The update and audit insert share one transaction.
- **Administrative changes:** user creation/update, course/class creation/update, and enrollment events use the authenticated administrator identity and generated resource target. User audit details retain changed field names and role only; passwords, hashes, names, email, USN, and profile values are not copied into audit details. User and academic writes commit with their audit insert in the same transaction.

Audit history remains restricted to administrators. The existing paginated endpoint filters by action and actor; this change adds validated inclusive UTC date filters (`startDate` and `endDate`). The existing administrator dashboard renders the returned time, actor, action, target, and details; it does not create or edit audit events in the client. Application operational errors use the structured logger's request ID and error code without logging payloads or secrets.

## Integrity coordination

The application exposes audit insertion and read operations only; it has no audit update/delete endpoint. Database-level append-only triggers are covered by the separate SAM-NF-006 change in [PR #79](https://github.com/PES1UG24AM462/1/pull/79), which must be merged and its migration applied to protect existing databases. This PR does not duplicate that migration or claim tamper-proof storage.

## Verification limits

Automated tests exercise the login event metadata, attendance correction transaction, administrative event transactions, audit retrieval filters, and unauthorized-access behavior. They use the repository's database mocks. TC-AUD-01 has not been run end-to-end against persisted records because this environment has no configured MySQL server/client.
