import React from 'react';
import ReactDOM from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as facultyService from '../../services/facultyService';
import FacultyDashboard from './FacultyDashboard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/facultyService', () => ({
  getAssignedClasses: jest.fn(),
  getClassRoster: jest.fn(),
}));

const classList = [
  { class_id: 12, course_code: 'CS301', course_name: 'Database Systems', section: 'A', academic_yr: '2026-27' },
  { class_id: 13, course_code: 'CS302', course_name: 'Operating Systems', section: 'B', academic_yr: '2026-27' },
];

const rosterFor = (classId, courseCode, studentId) => ({
  class: { classId, courseCode, courseName: 'Course', section: 'A' },
  date: '2026-10-23',
  students: [{
    studentId,
    usn: `PES1UG24CS00${studentId}`,
    fullName: `Student ${studentId}`,
    department: 'Computer Science',
    semester: 3,
  }],
});

let container;
let root;

async function renderDashboard() {
  await act(async () => {
    root.render(<FacultyDashboard />);
    await Promise.resolve();
  });
}

function changeValue(element, value) {
  act(() => {
    element.value = value;
    Simulate.change(element, { target: { value } });
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = ReactDOM.createRoot(container);
  useNavigate.mockReturnValue(jest.fn());
  useAuth.mockReturnValue({ user: { fullName: 'Faculty User' }, logout: jest.fn() });
  facultyService.getAssignedClasses.mockResolvedValue({ classes: classList });
  facultyService.getClassRoster.mockResolvedValue(rosterFor(12, 'CS301', 81));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('shows loading, retrieves assigned classes, and displays the correct roster for selected class and date', async () => {
  let resolveClasses;
  facultyService.getAssignedClasses.mockImplementation(() => new Promise((resolve) => {
    resolveClasses = resolve;
  }));

  act(() => {
    root.render(<FacultyDashboard />);
  });
  expect(container.textContent).toContain('Loading your assigned classes');

  await act(async () => {
    resolveClasses({ classes: classList });
  });
  expect(container.querySelector('#assigned-class')).not.toBeNull();

  changeValue(container.querySelector('#assigned-class'), '12');
  changeValue(container.querySelector('#attendance-date'), '2026-10-23');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });

  expect(facultyService.getClassRoster).toHaveBeenCalledWith('12', '2026-10-23');
  expect(container.textContent).toContain('Student 81');
  expect(container.textContent).toContain('2026-10-23');
});

test('changing class clears the old roster and loads the new class roster', async () => {
  facultyService.getClassRoster
    .mockResolvedValueOnce(rosterFor(12, 'CS301', 81))
    .mockResolvedValueOnce(rosterFor(13, 'CS302', 82));
  await renderDashboard();
  changeValue(container.querySelector('#assigned-class'), '12');
  changeValue(container.querySelector('#attendance-date'), '2026-10-23');

  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });
  expect(container.textContent).toContain('Student 81');

  changeValue(container.querySelector('#assigned-class'), '13');
  expect(container.textContent).not.toContain('Student 81');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });

  expect(facultyService.getClassRoster).toHaveBeenLastCalledWith('13', '2026-10-23');
  expect(container.textContent).toContain('Student 82');
});

test('shows an empty state when the faculty member has no assigned classes', async () => {
  facultyService.getAssignedClasses.mockResolvedValue({ classes: [] });
  await renderDashboard();
  expect(container.textContent).toContain('No classes are currently assigned');
});

test('shows an empty state for a class with no enrolled students', async () => {
  facultyService.getClassRoster.mockResolvedValue({
    class: { classId: 12, courseCode: 'CS301', courseName: 'Database Systems', section: 'A' },
    date: '2026-10-23',
    students: [],
  });
  await renderDashboard();
  changeValue(container.querySelector('#assigned-class'), '12');
  changeValue(container.querySelector('#attendance-date'), '2026-10-23');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });
  expect(container.textContent).toContain('There are no students enrolled in this class');
});

test('requires class and date selections before requesting a roster', async () => {
  await renderDashboard();
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
  });
  expect(container.textContent).toContain('Select an assigned class to continue');
  expect(facultyService.getClassRoster).not.toHaveBeenCalled();

  changeValue(container.querySelector('#assigned-class'), '12');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
  });
  expect(container.textContent).toContain('Select an attendance date to continue');
  expect(facultyService.getClassRoster).not.toHaveBeenCalled();
});

test('surfaces class and roster API errors without crashing', async () => {
  facultyService.getAssignedClasses.mockRejectedValueOnce(new Error('Classes unavailable'));
  await renderDashboard();
  expect(container.textContent).toContain('Classes unavailable');
  expect(container.querySelector('.faculty-secondary-button').textContent).toBe('Try again');

  facultyService.getAssignedClasses.mockResolvedValue({ classes: classList });
  await act(async () => {
    Simulate.click(container.querySelector('.faculty-secondary-button'));
    await Promise.resolve();
  });
  changeValue(container.querySelector('#assigned-class'), '12');
  changeValue(container.querySelector('#attendance-date'), '2026-10-23');
  facultyService.getClassRoster.mockRejectedValueOnce(new Error('Roster unavailable'));
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });
  expect(container.textContent).toContain('Roster unavailable');
});
