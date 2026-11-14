/** Administrator course, class, and student enrollment management (SAM-F-015). */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as academicService from '../../services/academicService';
import './AdminDashboard.css';

const SECTIONS = [
  { id: 'courses', label: 'Courses' },
  { id: 'classes', label: 'Classes' },
  { id: 'enrollments', label: 'Enrollments' },
];
const EMPTY_COURSE = { courseCode: '', courseName: '', description: '', credits: '' };
const EMPTY_CLASS = { courseId: '', facultyId: '', section: '', academicYear: '' };

function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('courses');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [students, setStudents] = useState([]);

  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseSaving, setCourseSaving] = useState(false);
  const [courseMessage, setCourseMessage] = useState('');
  const [courseError, setCourseError] = useState('');

  const [classForm, setClassForm] = useState(EMPTY_CLASS);
  const [editingClassId, setEditingClassId] = useState(null);
  const [classSaving, setClassSaving] = useState(false);
  const [classMessage, setClassMessage] = useState('');
  const [classError, setClassError] = useState('');

  const [selectedEnrollClass, setSelectedEnrollClass] = useState('');
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentsError, setEnrollmentsError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollmentMessage, setEnrollmentMessage] = useState('');
  const [enrollmentError, setEnrollmentError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [courseResult, classResult, facultyResult, studentResult] = await Promise.all([
        academicService.getCourses(), academicService.getClasses(),
        academicService.getFaculty(), academicService.getStudents(),
      ]);
      setCourses(courseResult.courses || []);
      setClasses(classResult.classes || []);
      setFaculty(facultyResult.faculty || []);
      setStudents(studentResult.students || []);
      setSelectedEnrollClass((current) => (
        current && classResult.classes.some((item) => String(item.classId) === current)
          ? current
          : String(classResult.classes[0]?.classId || '')
      ));
    } catch (err) {
      setLoadError(err.message || 'Unable to load academic records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnrollments = useCallback(async (classId) => {
    if (!classId) {
      setEnrollments([]);
      setEnrollmentsError('');
      return;
    }
    setEnrollmentsLoading(true);
    setEnrollmentsError('');
    try {
      const result = await academicService.getClassEnrollments(classId);
      setEnrollments(result.enrollments || []);
    } catch (err) {
      setEnrollments([]);
      setEnrollmentsError(err.message || 'Unable to load this class roster.');
    } finally {
      setEnrollmentsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadEnrollments(selectedEnrollClass); }, [selectedEnrollClass, loadEnrollments]);

  const notEnrolledStudents = useMemo(() => {
    const enrolledIds = new Set(enrollments.map((entry) => String(entry.studentId)));
    return students.filter((student) => !enrolledIds.has(String(student.studentId)));
  }, [enrollments, students]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function editCourse(course) {
    setEditingCourseId(course.courseId);
    setCourseForm({ courseCode: course.courseCode, courseName: course.courseName, description: course.description || '', credits: course.credits == null ? '' : String(course.credits) });
    setCourseMessage('');
    setCourseError('');
    setActiveSection('courses');
  }

  function cancelCourseEdit() {
    setEditingCourseId(null);
    setCourseForm(EMPTY_COURSE);
    setCourseError('');
  }

  async function submitCourse(event) {
    event.preventDefault();
    setCourseSaving(true);
    setCourseMessage('');
    setCourseError('');
    const payload = {
      ...courseForm,
      courseCode: courseForm.courseCode.trim(),
      courseName: courseForm.courseName.trim(),
      description: courseForm.description.trim(),
      credits: courseForm.credits === '' ? null : Number(courseForm.credits),
    };
    try {
      if (editingCourseId) {
        await academicService.updateCourse(editingCourseId, payload);
        setCourseMessage('Course updated.');
      } else {
        await academicService.createCourse(payload);
        setCourseMessage('Course created.');
      }
      setEditingCourseId(null);
      setCourseForm(EMPTY_COURSE);
      await loadData();
    } catch (err) {
      setCourseError(err.message || 'Unable to save this course.');
    } finally {
      setCourseSaving(false);
    }
  }

  function editClass(classRecord) {
    setEditingClassId(classRecord.classId);
    setClassForm({ courseId: String(classRecord.courseId), facultyId: String(classRecord.facultyId), section: classRecord.section || '', academicYear: classRecord.academicYear || '' });
    setClassMessage('');
    setClassError('');
    setActiveSection('classes');
  }

  function cancelClassEdit() {
    setEditingClassId(null);
    setClassForm(EMPTY_CLASS);
    setClassError('');
  }

  async function submitClass(event) {
    event.preventDefault();
    setClassSaving(true);
    setClassMessage('');
    setClassError('');
    const payload = {
      facultyId: Number(classForm.facultyId),
      section: classForm.section.trim(),
      academicYear: classForm.academicYear.trim(),
    };
    if (!editingClassId) payload.courseId = Number(classForm.courseId);
    try {
      if (editingClassId) {
        await academicService.updateClass(editingClassId, payload);
        setClassMessage('Class updated.');
      } else {
        await academicService.createClass(payload);
        setClassMessage('Class created.');
      }
      setEditingClassId(null);
      setClassForm(EMPTY_CLASS);
      await loadData();
    } catch (err) {
      setClassError(err.message || 'Unable to save this class.');
    } finally {
      setClassSaving(false);
    }
  }

  async function submitEnrollment(event) {
    event.preventDefault();
    if (!selectedEnrollClass || !selectedStudent) {
      setEnrollmentError('Select a class and student to continue.');
      return;
    }
    setEnrolling(true);
    setEnrollmentMessage('');
    setEnrollmentError('');
    try {
      await academicService.enrollStudent(selectedEnrollClass, selectedStudent);
      setSelectedStudent('');
      setEnrollmentMessage('Student enrolled. The class roster has been refreshed.');
      await loadEnrollments(selectedEnrollClass);
    } catch (err) {
      setEnrollmentError(err.message || 'Unable to enroll this student.');
    } finally {
      setEnrolling(false);
    }
  }

  const selectedClass = classes.find((item) => String(item.classId) === selectedEnrollClass);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Student Attendance Management System</p>
          <h1>Academic management</h1>
          <p className="admin-subtitle">Manage courses, class sections, and student rosters.</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-user">{user?.fullName || 'Administrator'}</span>
          <Link className="admin-secondary-button" to="/reports/attendance">Attendance reports</Link>
          <button className="admin-signout" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Academic management sections" role="tablist">
        {SECTIONS.map((section) => (
          <button key={section.id} type="button" role="tab" aria-selected={activeSection === section.id}
            className={activeSection === section.id ? 'admin-tab admin-tab-active' : 'admin-tab'}
            onClick={() => setActiveSection(section.id)}>{section.label}</button>
        ))}
      </nav>

      {loadError && <div className="admin-message admin-message-error" role="alert"><span>{loadError}</span><button type="button" className="admin-inline-button" onClick={loadData}>Try again</button></div>}
      {loading && <p className="admin-loading" role="status">Loading academic records…</p>}

      {!loading && !loadError && activeSection === 'courses' && (
        <section className="admin-layout" aria-labelledby="courses-title">
          <div className="admin-panel">
            <div className="admin-panel-heading"><div><p className="admin-kicker">Catalog</p><h2 id="courses-title">Courses</h2></div><span className="admin-count">{courses.length} total</span></div>
            {courseMessage && <p className="admin-message admin-message-success" role="status">{courseMessage}</p>}
            {courseError && <p className="admin-message admin-message-error" role="alert">{courseError}</p>}
            <form className="admin-form" onSubmit={submitCourse}>
              <h3>{editingCourseId ? 'Edit course' : 'Add a course'}</h3>
              <label>Course code<input value={courseForm.courseCode} maxLength="20" required onChange={(e) => setCourseForm({ ...courseForm, courseCode: e.target.value })} /></label>
              <label>Course name<input value={courseForm.courseName} maxLength="150" required onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })} /></label>
              <label>Description<textarea value={courseForm.description} rows="3" maxLength="10000" onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></label>
              <label>Credits <span className="admin-optional">(optional)</span><input type="number" min="0" max="255" step="1" value={courseForm.credits} onChange={(e) => setCourseForm({ ...courseForm, credits: e.target.value })} /></label>
              <div className="admin-form-actions"><button type="submit" className="admin-primary-button" disabled={courseSaving}>{courseSaving ? 'Saving…' : editingCourseId ? 'Save course' : 'Create course'}</button>{editingCourseId && <button type="button" className="admin-secondary-button" onClick={cancelCourseEdit}>Cancel</button>}</div>
            </form>
          </div>
          <div className="admin-panel admin-list-panel"><h2>Course list</h2>
            {courses.length === 0 ? <p className="admin-empty">No courses have been added.</p> : <div className="admin-record-list">{courses.map((course) => (
              <article className="admin-record" key={course.courseId}><div><span className="admin-record-code">{course.courseCode}</span><h3>{course.courseName}</h3>{course.description && <p>{course.description}</p>}<small>{course.credits == null ? 'Credits not specified' : `${course.credits} credit${Number(course.credits) === 1 ? '' : 's'}`}</small></div><button type="button" className="admin-text-button" onClick={() => editCourse(course)}>Edit</button></article>
            ))}</div>}
          </div>
        </section>
      )}

      {!loading && !loadError && activeSection === 'classes' && (
        <section className="admin-layout" aria-labelledby="classes-title">
          <div className="admin-panel">
            <div className="admin-panel-heading"><div><p className="admin-kicker">Sections and assignments</p><h2 id="classes-title">Classes</h2></div><span className="admin-count">{classes.length} total</span></div>
            {classMessage && <p className="admin-message admin-message-success" role="status">{classMessage}</p>}
            {classError && <p className="admin-message admin-message-error" role="alert">{classError}</p>}
            {courses.length === 0 && <p className="admin-message admin-message-info">Create a course before adding a class.</p>}
            {faculty.length === 0 && <p className="admin-message admin-message-info">No faculty profiles are available for class assignment.</p>}
            <form className="admin-form" onSubmit={submitClass}>
              <h3>{editingClassId ? 'Edit class' : 'Add a class'}</h3>
              <label>Course<select required value={classForm.courseId} disabled={Boolean(editingClassId)} onChange={(e) => setClassForm({ ...classForm, courseId: e.target.value })}><option value="">Choose a course</option>{courses.map((item) => <option key={item.courseId} value={item.courseId}>{item.courseCode} · {item.courseName}</option>)}</select></label>
              <label>Assigned faculty<select required value={classForm.facultyId} onChange={(e) => setClassForm({ ...classForm, facultyId: e.target.value })}><option value="">Choose faculty</option>{faculty.map((item) => <option key={item.facultyId} value={item.facultyId}>{item.fullName}{item.department ? ` · ${item.department}` : ''}</option>)}</select></label>
              <label>Section <span className="admin-optional">(optional)</span><input value={classForm.section} maxLength="20" onChange={(e) => setClassForm({ ...classForm, section: e.target.value })} /></label>
              <label>Academic year <span className="admin-optional">(optional)</span><input value={classForm.academicYear} maxLength="10" placeholder="e.g. 2026-27" onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })} /></label>
              <div className="admin-form-actions"><button type="submit" className="admin-primary-button" disabled={classSaving || courses.length === 0 || faculty.length === 0}>{classSaving ? 'Saving…' : editingClassId ? 'Save class' : 'Create class'}</button>{editingClassId && <button type="button" className="admin-secondary-button" onClick={cancelClassEdit}>Cancel</button>}</div>
            </form>
          </div>
          <div className="admin-panel admin-list-panel"><h2>Class list</h2>
            {classes.length === 0 ? <p className="admin-empty">No classes have been added.</p> : <div className="admin-record-list">{classes.map((classRecord) => (
              <article className="admin-record" key={classRecord.classId}><div><span className="admin-record-code">{classRecord.courseCode}</span><h3>{classRecord.courseName}{classRecord.section ? ` · ${classRecord.section}` : ''}</h3><p>{classRecord.facultyName}{classRecord.academicYear ? ` · ${classRecord.academicYear}` : ''}</p></div><button type="button" className="admin-text-button" onClick={() => editClass(classRecord)}>Edit</button></article>
            ))}</div>}
          </div>
        </section>
      )}

      {!loading && !loadError && activeSection === 'enrollments' && (
        <section className="admin-panel" aria-labelledby="enrollments-title">
          <div className="admin-panel-heading"><div><p className="admin-kicker">Class roster</p><h2 id="enrollments-title">Student enrollments</h2></div><span className="admin-count">{enrollments.length} enrolled</span></div>
          {classes.length === 0 ? <p className="admin-empty">Create a class before managing enrollments.</p> : <>
            <div className="admin-enrollment-toolbar"><label>Class<select value={selectedEnrollClass} onChange={(e) => { setSelectedEnrollClass(e.target.value); setEnrollmentMessage(''); setEnrollmentError(''); }}>{classes.map((item) => <option key={item.classId} value={item.classId}>{item.courseCode} · {item.courseName}{item.section ? ` · ${item.section}` : ''}{item.academicYear ? ` · ${item.academicYear}` : ''}</option>)}</select></label><span className="admin-selected-faculty">{selectedClass?.facultyName || ''}</span></div>
            {enrollmentMessage && <p className="admin-message admin-message-success" role="status">{enrollmentMessage}</p>}
            {enrollmentError && <p className="admin-message admin-message-error" role="alert">{enrollmentError}</p>}
            <form className="admin-enroll-form" onSubmit={submitEnrollment}><label>Add a student<select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} required><option value="">Choose a student</option>{notEnrolledStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.fullName} · {student.usn}</option>)}</select></label><button type="submit" className="admin-primary-button" disabled={enrolling || !selectedStudent || notEnrolledStudents.length === 0}>{enrolling ? 'Enrolling…' : 'Enroll student'}</button></form>
            {notEnrolledStudents.length === 0 && students.length > 0 && <p className="admin-empty">All available student records are enrolled in this class.</p>}
            {enrollmentsLoading ? <p className="admin-loading" role="status">Loading this class roster…</p> : enrollmentsError ? <p className="admin-message admin-message-error" role="alert">{enrollmentsError}</p> : enrollments.length === 0 ? <p className="admin-empty">No students are enrolled in this class.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Student</th><th>USN</th><th>Department</th><th>Semester</th><th>Enrolled</th></tr></thead><tbody>{enrollments.map((entry) => <tr key={entry.enrollmentId}><td>{entry.fullName}</td><td>{entry.usn}</td><td>{entry.department || '—'}</td><td>{entry.semester ?? '—'}</td><td>{entry.enrolledAt ? new Date(entry.enrolledAt).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div>}
            <p className="admin-history-note">Roster changes take effect immediately. Existing attendance history stays attached to its class and student records.</p>
          </>}
        </section>
      )}
    </main>
  );
}

export default AdminDashboard;
