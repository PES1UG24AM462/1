# SAM-F-015 implementation notes

## Approved traceability

- **SRS requirement SAM-F-015:** The system shall allow administrators to create and manage classes, courses, and student enrollments.
- **Acceptance ID AC-SAM-F-015:** Referential integrity is required; enrollment changes appear in the class roster.
- **Issue #47 acceptance:** Enrollment changes appear in the class roster.
- **STP test case TC-ADM-02:** Administrator creates classes/courses and changes enrollments reflected in rosters.
- **Related requirements:** SAM-F-002 and SAM-SR-003 for server-side role authorization; SAM-F-004 for the enrolled roster used by attendance; SAM-F-016 and SAM-SR-004 for administrative audit entries.

## Implementation coverage

The implementation uses the existing `courses`, `classes`, `students`, `faculty`, `enrollments`, `attendance`, and `audit_log` tables. Course codes retain the schema's unique constraint. Classes require existing course and faculty profiles. Enrollments require existing student and class rows and rely on the existing unique `(student_id, class_id)` key. Roster queries select through `enrollments`. Enrollment creation does not update or delete attendance rows.

## Open decisions from the approved baseline

The SRS, SAD, STP, issue acceptance criteria, and existing schema do not define:

- Whether courses or classes should be deactivated, archived, or deleted, or what to do when historical records refer to them.
- Whether enrollment withdrawal should delete a relationship, retain an inactive status, or create a dated enrollment history; the current schema has no enrollment status or end date.
- Whether a class may be moved to another course after it has enrollments or attendance.
- Additional academic eligibility rules for enrolling an existing student.

Accordingly, this implementation supports creating and editing courses and class details, assigning a course on class creation, and adding students to a class. It does not expose course/class deletion, class-course reassignment after creation, or enrollment withdrawal/deactivation until those behaviors are approved. Existing attendance rows remain attached to their original student and class records.
