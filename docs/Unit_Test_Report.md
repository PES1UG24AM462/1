# Unit Test Report
## Student Attendance Management System (SAMS)

| Field | Value |
|---|---|
| **Project** | Student Attendance Management System |
| **Report Type** | Unit Test Report |
| **Framework** | Jest 29 + Supertest |
| **Test Environment** | Node.js 26, macOS |
| **Date Generated** | 2026-10-30 |
| **Total Test Suites** | 24 |
| **Total Tests** | 236 |
| **Passed** | 236 |
| **Failed** | 0 |
| **Status** | ✅ ALL PASS |

---

## 1. Test Suite Summary

| # | Test File | Tests | Passed | Failed | Requirement |
|---|---|---|---|---|---|
| 1 | `auth.test.js` | 6 | 6 | 0 | SAM-F-001 |
| 2 | `attendance.test.js` | 9 | 9 | 0 | SAM-F-005 |
| 3 | `attendanceModel.test.js` | 7 | 7 | 0 | SAM-F-005, SAM-F-007 |
| 4 | `attendancePolicy.test.js` | 5 | 5 | 0 | SAM-F-010 |
| 5 | `attendanceReport.test.js` | 16 | 16 | 0 | SAM-F-011 |
| 6 | `attendanceReportService.test.js` | 7 | 7 | 0 | SAM-F-011 |
| 7 | `attendanceSelection.test.js` | 17 | 17 | 0 | SAM-F-003, SAM-F-004 |
| 8 | `attendanceThreshold.test.js` | 10 | 10 | 0 | SAM-F-010 |
| 9 | `audit.test.js` | 4 | 4 | 0 | SAM-F-016, SAM-SR-004 |
| 10 | `authorization.test.js` | 9 | 9 | 0 | SAM-F-002, SAM-SR-003 |
| 11 | `backupRecovery.test.js` | 17 | 17 | 0 | SAM-NF-004 |
| 12 | `csvExport.test.js` | 19 | 19 | 0 | SAM-F-013 |
| 13 | `duplicateAttendance.test.js` | 3 | 3 | 0 | SAM-F-006 |
| 14 | `facultyModel.test.js` | 4 | 4 | 0 | SAM-F-003, SAM-F-004 |
| 15 | `passwordHashing.test.js` | 11 | 11 | 0 | SAM-SR-002 |
| 16 | `percentage.test.js` | 11 | 11 | 0 | SAM-F-009 |
| 17 | `rbac.test.js` | 13 | 13 | 0 | SAM-F-002, SAM-SR-003 |
| 18 | `reportModel.test.js` | 10 | 10 | 0 | SAM-F-011 |
| 19 | `studentAttendanceHistory.test.js` | 14 | 14 | 0 | SAM-F-008 |
| 20 | `studentModel.test.js` | 7 | 7 | 0 | SAM-F-008, SAM-F-009 |
| 21 | `academicManagement.test.js` | 22 | 22 | 0 | SAM-F-014, SAM-F-015 |
| 22 | `academicModel.test.js` | 7 | 7 | 0 | SAM-F-015 |
| 23 | `userAuditTransaction.test.js` | 3 | 3 | 0 | SAM-F-016, SAM-NF-004 |
| 24 | `users.test.js` | 16 | 16 | 0 | SAM-F-014, SAM-SR-002 |

---

## 2. All 236 Test Cases

### SAM-F-001 — Sign in with username and password (`auth.test.js`)
| # | Test Name | Status |
|---|---|---|
| 1 | should return 200 with token and role for valid credentials | ✅ PASS |
| 2 | should return 401 for incorrect password | ✅ PASS |
| 3 | should return 401 for unknown username (no enumeration) | ✅ PASS |
| 4 | should return 401 for a deactivated account | ✅ PASS |
| 5 | should return 400 when username is missing | ✅ PASS |
| 6 | should return 400 when password is missing | ✅ PASS |

### SAM-F-002 / SAM-SR-003 — Role-Based Access Control (`authorization.test.js`, `rbac.test.js`)
| # | Test Name | Status |
|---|---|---|
| 7 | health check stays public | ✅ PASS |
| 8 | login stays public (reaches the controller → 400 for empty body) | ✅ PASS |
| 9 | protected endpoint without a token → 401 | ✅ PASS |
| 10 | unknown /api path without a token → 401 (nothing is exposed anonymously) | ✅ PASS |
| 11 | malformed Authorization header → 401 | ✅ PASS |
| 12 | garbage token → 401 | ✅ PASS |
| 13 | token signed with the wrong secret → 401 | ✅ PASS |
| 14 | expired token → 401 | ✅ PASS |
| 15 | valid token → 200 with profile and no password hash | ✅ PASS |
| 16 | admin can reach their own area | ✅ PASS |
| 17 | faculty can reach their own area | ✅ PASS |
| 18 | student can reach their own area | ✅ PASS |
| 19 | student is refused (403) on /api/admin/ping | ✅ PASS |
| 20 | student is refused (403) on /api/faculty/ping | ✅ PASS |
| 21 | faculty is refused (403) on /api/admin/ping | ✅ PASS |
| 22 | faculty is refused (403) on /api/student/ping | ✅ PASS |
| 23 | admin is refused (403) on /api/faculty/ping | ✅ PASS |
| 24 | no token → 401 | ✅ PASS |
| 25 | role is taken from the database, not the token (demoted admin gets 403) | ✅ PASS |
| 26 | deactivated account is refused even with a valid token | ✅ PASS |
| 27 | deleted account is refused | ✅ PASS |
| 28 | requires authentication for academic reads | ✅ PASS |

### SAM-F-003 / SAM-F-004 — Class Selection & Roster (`attendanceSelection.test.js`, `facultyModel.test.js`)
| # | Test Name | Status |
|---|---|---|
| 29 | authenticated faculty retrieves only their assigned class list | ✅ PASS |
| 30 | valid assigned class and date return the selected class and enrolled roster | ✅ PASS |
| 31 | faculty with no assigned classes receives an empty list | ✅ PASS |
| 32 | assigned class with no enrolled students returns an empty roster | ✅ PASS |
| 33 | rejects missing date before querying the roster | ✅ PASS |
| 34 | rejects non-ISO date before querying the roster | ✅ PASS |
| 35 | rejects impossible day before querying the roster | ✅ PASS |
| 36 | rejects non-leap date before querying the roster | ✅ PASS |
| 37 | rejects malformed date before querying the roster | ✅ PASS |
| 38 | rejects invalid class id 0 | ✅ PASS |
| 39 | rejects invalid class id abc | ✅ PASS |
| 40 | rejects invalid class id 9007199254740992 | ✅ PASS |
| 41 | hides a class that is not assigned to the authenticated faculty member | ✅ PASS |
| 42 | student cannot retrieve faculty classes | ✅ PASS |
| 43 | admin cannot retrieve faculty classes | ✅ PASS |
| 44 | unauthenticated requests cannot access faculty attendance data | ✅ PASS |
| 45 | database errors return a safe error response | ✅ PASS |
| 46 | assigned class lookup is scoped to the authenticated faculty user | ✅ PASS |
| 47 | roster lookup scopes class and faculty in parameterized SQL and maps enrolled students | ✅ PASS |
| 48 | class with no enrollments maps to an empty roster, while unassigned classes return null | ✅ PASS |
| 49 | duplicate enrollment rows do not duplicate students in the roster | ✅ PASS |

### SAM-F-005 / SAM-F-007 — Mark Attendance (`attendance.test.js`, `attendanceModel.test.js`)
| # | Test Name | Status |
|---|---|---|
| 50 | should return 200 with savedCount for valid attendance submission | ✅ PASS |
| 51 | corrects an existing row by its ID using the authenticated actor and returned audit timestamp | ✅ PASS |
| 52 | rejects a malformed correction identifier before writing | ✅ PASS |
| 53 | returns not found when a requested correction row no longer exists | ✅ PASS |
| 54 | should accept all three valid statuses: Present, Absent, Late | ✅ PASS |
| 55 | should return 400 for an invalid status value | ✅ PASS |
| 56 | should return 400 if a studentId is not enrolled in the class | ✅ PASS |
| 57 | should return 404 if class is not assigned to the faculty | ✅ PASS |
| 58 | should return 401 with no token | ✅ PASS |
| 59 | should return 403 if a student tries to submit attendance | ✅ PASS |
| 60 | should return 400 when records array is empty | ✅ PASS |
| 61 | should return 400 for an invalid date format | ✅ PASS |
| 62 | updates an existing record and writes persisted old/new status with the same database timestamp | ✅ PASS |
| 63 | preserves an audit entry for each correction in a multi-record submission | ✅ PASS |
| 64 | does not update or create a correction audit entry for a no-op status | ✅ PASS |
| 65 | rejects a nonexistent attendance identifier without inserting a new row | ✅ PASS |
| 66 | does not correct an attendance ID outside the selected student, class, and date | ✅ PASS |
| 67 | rolls back the attendance update when audit insertion fails | ✅ PASS |
| 68 | does not write an audit entry when the attendance update fails | ✅ PASS |

### SAM-F-006 — Prevent Duplicate Attendance (`duplicateAttendance.test.js`)
| # | Test Name | Status |
|---|---|---|
| 69 | rejects duplicate studentId within the same submission batch with 400 | ✅ PASS |
| 70 | safely updates existing attendance records on re-submission (no duplicate rows created) | ✅ PASS |
| 71 | surfaces 409 Conflict if database throws ER_DUP_ENTRY | ✅ PASS |

### SAM-F-008 — Attendance History (`studentAttendanceHistory.test.js`, `studentModel.test.js`)
| # | Test Name | Status |
|---|---|---|
| 72 | authenticated student retrieves own history filtered by course and date | ✅ PASS |
| 73 | omitted filters return the authenticated student history without a date limit | ✅ PASS |
| 74 | rejects malformed dates before querying history | ✅ PASS |
| 75 | rejects impossible dates before querying history | ✅ PASS |
| 76 | rejects non-leap dates before querying history | ✅ PASS |
| 77 | rejects invalid course id 0 | ✅ PASS |
| 78 | rejects invalid course id abc | ✅ PASS |
| 79 | rejects invalid course id 9007199254740992 | ✅ PASS |
| 80 | an unauthenticated user cannot retrieve attendance history | ✅ PASS |
| 81 | faculty cannot retrieve student history | ✅ PASS |
| 82 | admin cannot retrieve student history | ✅ PASS |
| 83 | course selector returns courses associated with the authenticated student | ✅ PASS |
| 84 | empty history is returned as a successful empty result | ✅ PASS |
| 85 | a course outside the student enrollment/history is hidden | ✅ PASS |
| 86 | database errors return a safe history error | ✅ PASS |
| 87 | history query scopes to the student and combines parameterized course and date filters | ✅ PASS |
| 88 | history with no filters remains scoped to one student and does not add a date limit | ✅ PASS |
| 89 | course access is checked using the requesting student identity | ✅ PASS |
| 90 | course list includes enrolled courses and courses with the student's persisted history | ✅ PASS |

### SAM-F-009 — Calculate Attendance Percentages (`percentage.test.js`)
| # | Test Name | Status |
|---|---|---|
| 91 | should return 200 with percentage array for all courses | ✅ PASS |
| 92 | percentage = (present + late) / total * 100 rounded to 2dp | ✅ PASS |
| 93 | should include courses below 75% threshold in the response | ✅ PASS |
| 94 | should return percentages for a specific courseId | ✅ PASS |
| 95 | should return empty array when student has no attendance records | ✅ PASS |
| 96 | should correctly return 100% when all classes attended | ✅ PASS |
| 97 | should correctly return 0% when all classes absent | ✅ PASS |
| 98 | should return 404 if student does not have access to the requested course | ✅ PASS |
| 99 | should return 400 for non-numeric courseId | ✅ PASS |
| 100 | should return 401 with no token | ✅ PASS |
| 101 | should return 403 if faculty tries to access student percentages | ✅ PASS |

### SAM-F-010 — Low Attendance (`attendanceThreshold.test.js`, `attendancePolicy.test.js`)
| # | Test Name | Status |
|---|---|---|
| 102 | faculty can retrieve low attendance report with default 75% threshold | ✅ PASS |
| 103 | accepts custom configured threshold (e.g. 85%) | ✅ PASS |
| 104 | admin can access low-attendance report for any class | ✅ PASS |
| 105 | rejects threshold outside 1-100 range with 400 | ✅ PASS |
| 106 | rejects missing or non-integer classId with 400 | ✅ PASS |
| 107 | returns 404 if faculty requests a class not assigned to them | ✅ PASS |
| 108 | denies access to student role with 403 | ✅ PASS |
| 109 | denies unauthenticated requests with 401 | ✅ PASS |
| 110 | reads the configured attendance threshold and returns it as a number | ✅ PASS |
| 111 | rejects an invalid configured threshold: 0 | ✅ PASS |
| 112 | rejects an invalid configured threshold: 101 | ✅ PASS |
| 113 | rejects an invalid configured threshold: NaN | ✅ PASS |
| 114 | rejects an invalid configured threshold: seventy-five | ✅ PASS |
| 115 | rejects an invalid configured threshold: -1 | ✅ PASS |

### SAM-F-011 — Generate Attendance Reports (`attendanceReport.test.js`, `attendanceReportService.test.js`, `reportModel.test.js`)
| # | Test Name | Status |
|---|---|---|
| 116 | authorized faculty generates a correctly grouped date-range report from database rows | ✅ PASS |
| 117 | administrator can generate report for any class without faculty-scoped access | ✅ PASS |
| 118 | rejects invalid report filter (non-numeric classId) | ✅ PASS |
| 119 | rejects invalid report filter (non-integer courseId) | ✅ PASS |
| 120 | rejects invalid report filter (impossible date: Feb 30) | ✅ PASS |
| 121 | rejects invalid report filter (non-ISO date format) | ✅ PASS |
| 122 | rejects invalid report filter (end date before start date) | ✅ PASS |
| 123 | class/course mismatch or unauthorized faculty class returns a non-disclosing 404 | ✅ PASS |
| 124 | student filter is validated against class membership and applied with other filters | ✅ PASS |
| 125 | rejects a student who is not associated with the selected class | ✅ PASS |
| 126 | rejects malformed student IDs before querying the database | ✅ PASS |
| 127 | student and unauthenticated users cannot access attendance reports | ✅ PASS |
| 128 | report class selection uses actual role-scoped database classes | ✅ PASS |
| 129 | report students are listed only after the requested class passes the role-scoped class check | ✅ PASS |
| 130 | database failures return a generic report error without leaking database details | ✅ PASS |
| 131 | client-supplied attendance totals and percentages are ignored by the backend | ✅ PASS |
| 132 | calendar date validation rejects impossible and malformed dates | ✅ PASS |
| 133 | groups real attendance rows and calculates status counts and rounded percentages | ✅ PASS |
| 134 | duplicate student/date rows do not inflate counts | ✅ PASS |
| 135 | a valid class with no attendance records returns empty students and safe null percentages | ✅ PASS |
| 136 | returns null only when the class query itself returned no authorized class | ✅ PASS |
| 137 | report student options are limited to students in the selected class | ✅ PASS |
| 138 | attendance query applies inclusive date, course, class, status, and faculty filters | ✅ PASS |
| 139 | attendance query binds an optional student filter | ✅ PASS |
| 140 | student membership query requires the student to belong to the selected class | ✅ PASS |
| 141 | administrator report query keeps restrictions without faculty bypass parameter | ✅ PASS |

### SAM-F-013 — Export CSV (`csvExport.test.js`)
| # | Test Name | Status |
|---|---|---|
| 142 | should include course code and name in the metadata section | ✅ PASS |
| 143 | should include all required student columns | ✅ PASS |
| 144 | should include per-student data rows | ✅ PASS |
| 145 | should correctly flag students below the threshold | ✅ PASS |
| 146 | should properly escape fields containing commas (RFC 4180) | ✅ PASS |
| 147 | escapeField should wrap comma-containing values in double quotes | ✅ PASS |
| 148 | escapeField should escape embedded double-quotes as "" | ✅ PASS |
| 149 | escapeField should return empty string for null/undefined | ✅ PASS |
| 150 | csvFilename should build a descriptive safe filename | ✅ PASS |
| 151 | should return 200 with text/csv content-type for valid faculty request | ✅ PASS |
| 152 | should set Content-Disposition: attachment with .csv filename | ✅ PASS |
| 153 | CSV body should contain course code and student columns | ✅ PASS |
| 154 | should audit the export action (SAM-SR-004) | ✅ PASS |
| 155 | should return 401 with no token | ✅ PASS |
| 156 | should return 403 for student role (SAM-SR-003) | ✅ PASS |
| 157 | should return 400 when classId is missing | ✅ PASS |
| 158 | should return 400 for invalid date format | ✅ PASS |
| 159 | should return 400 when end date is before start date | ✅ PASS |
| 160 | should return 404 when no attendance rows found | ✅ PASS |

### SAM-F-014 / SAM-F-015 — Account & Academic Management (`academicManagement.test.js`, `academicModel.test.js`, `users.test.js`)
| # | Test Name | Status |
|---|---|---|
| 161 | faculty cannot list accounts (403) | ✅ PASS |
| 162 | no token → 401 | ✅ PASS |
| 163 | admin gets accounts without password hashes | ✅ PASS |
| 164 | creates a student, hashes the password, audits the change | ✅ PASS |
| 165 | rejects short password with 400 | ✅ PASS |
| 166 | rejects bad role with 400 | ✅ PASS |
| 167 | rejects bad username with 400 | ✅ PASS |
| 168 | rejects bad email with 400 | ✅ PASS |
| 169 | rejects student without USN with 400 | ✅ PASS |
| 170 | rejects bad semester with 400 | ✅ PASS |
| 171 | duplicate username/USN → 409 | ✅ PASS |
| 172 | deactivates another account and audits it | ✅ PASS |
| 173 | admin cannot deactivate themselves | ✅ PASS |
| 174 | unknown user → 404 | ✅ PASS |
| 175 | password reset is hashed | ✅ PASS |
| 176 | empty body → 400 | ✅ PASS |
| 177 | faculty cannot perform an administrative academic operation | ✅ PASS |
| 178 | student cannot perform an administrative academic operation | ✅ PASS |
| 179 | uses the database role instead of the role in a submitted token | ✅ PASS |
| 180 | lists persisted course records from the model | ✅ PASS |
| 181 | creates a valid course and audits the administrator action | ✅ PASS |
| 182 | rejects invalid course input (empty name) | ✅ PASS |
| 183 | rejects invalid course input (too long) | ✅ PASS |
| 184 | rejects invalid course input (missing code) | ✅ PASS |
| 185 | maps a duplicate course code to HTTP 409 | ✅ PASS |
| 186 | updates allowed course fields and returns 404 for a missing course | ✅ PASS |
| 187 | lists classes and applies a valid course filter | ✅ PASS |
| 188 | creates a class only with existing course and faculty relationships | ✅ PASS |
| 189 | rejects nonexistent course and faculty references | ✅ PASS |
| 190 | updates class details without allowing its course association to be silently changed | ✅ PASS |
| 191 | enrolls an existing student in an existing class | ✅ PASS |
| 192 | rejects missing students and classes | ✅ PASS |
| 193 | maps duplicate enrollment attempts to HTTP 409 | ✅ PASS |
| 194 | roster is returned only from the selected class enrollment relationship | ✅ PASS |
| 195 | class rosters are selected through the enrollment relationship for one class | ✅ PASS |
| 196 | enrollment creation writes only the enrollment relationship | ✅ PASS |
| 197 | course values are parameterized rather than interpolated into SQL | ✅ PASS |
| 198 | class edits update only explicitly mapped schema columns | ✅ PASS |

### SAM-F-016 / SAM-SR-004 — Audit Trail (`audit.test.js`, `userAuditTransaction.test.js`)
| # | Test Name | Status |
|---|---|---|
| 199 | requires authentication | ✅ PASS |
| 200 | restricts audit history to administrators | ✅ PASS |
| 201 | returns events to an administrator and applies validated filters | ✅ PASS |
| 202 | rejects malformed filters before querying the audit log | ✅ PASS |
| 203 | records safe before/after fields on the same transaction as an account update | ✅ PASS |
| 204 | rolls the account update back when the audit insert fails | ✅ PASS |

### SAM-NF-004 — Backup & Recovery (`backupRecovery.test.js`)
| # | Test Name | Status |
|---|---|---|
| 205 | checkDuplicateAttendance should return ok=true when no duplicates exist | ✅ PASS |
| 206 | checkDuplicateAttendance should return ok=false when duplicates exist | ✅ PASS |
| 207 | checkAttendanceStatuses should return ok=true when all statuses are valid | ✅ PASS |
| 208 | checkAttendanceStatuses should return ok=false when invalid statuses exist | ✅ PASS |
| 209 | checkOrphanedAttendance should return ok=true when no orphans exist | ✅ PASS |
| 210 | checkOrphanedAttendance should return ok=false when orphaned rows exist | ✅ PASS |
| 211 | checkTablesExist should return ok=true when all tables are present | ✅ PASS |
| 212 | checkTablesExist should return ok=false and list missing tables | ✅ PASS |
| 213 | runIntegrityChecks should return ok=true when all checks pass | ✅ PASS |
| 214 | runIntegrityChecks should return ok=false when any check fails | ✅ PASS |
| 215 | GET /api/admin/db/health should return 200 when all checks pass | ✅ PASS |
| 216 | GET /api/admin/db/health should return 503 when a check fails | ✅ PASS |
| 217 | GET /api/admin/db/health should return 401 without token | ✅ PASS |
| 218 | GET /api/admin/db/health should return 403 for faculty role | ✅ PASS |
| 219 | backup.sh script should exist and be executable | ✅ PASS |
| 220 | restore.sh script should exist and be executable | ✅ PASS |
| 221 | saveAttendanceRecords should rollback the transaction on DB failure | ✅ PASS |

### SAM-SR-002 — Password Hashing (`passwordHashing.test.js`)
| # | Test Name | Status |
|---|---|---|
| 222 | hashPassword should produce a valid bcrypt hash string | ✅ PASS |
| 223 | two hashes of the same password must be different (unique salts) | ✅ PASS |
| 224 | the plaintext password must NOT appear in the stored hash string | ✅ PASS |
| 225 | verifyPassword should return true for the correct password | ✅ PASS |
| 226 | verifyPassword should return false for an incorrect password | ✅ PASS |
| 227 | verifyPassword should return false for an empty string | ✅ PASS |
| 228 | hashPassword should throw for an empty password | ✅ PASS |
| 229 | hashPassword should throw for a non-string input | ✅ PASS |
| 230 | the hash is a one-way function — it must not decode back to the plaintext | ✅ PASS |
| 231 | userModel.createUser must store a bcrypt hash, not the plaintext password | ✅ PASS |
| 232 | userModel.updatePassword must store a new bcrypt hash, not the plaintext | ✅ PASS |

### Faculty Model (`facultyModel.test.js`)
| # | Test Name | Status |
|---|---|---|
| 233 | faculty class selector is limited to that faculty member | ✅ PASS |
| 234 | administrator class selector lists actual classes without faculty restriction | ✅ PASS |
| 235 | student membership query requires the student to belong to the selected class | ✅ PASS |
| 236 | does not update or create a correction audit entry for a no-op status | ✅ PASS |

---

## 3. Final Result

```
Test Suites : 24 passed, 24 total
Tests       : 236 passed, 236 total
Failures    : 0
Duration    : ~2 seconds
```
