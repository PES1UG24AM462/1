import React from 'react';
import ReactDOM from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as studentService from '../../services/studentService';
import StudentDashboard from './StudentDashboard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/studentService', () => ({
  getEnrolledCourses: jest.fn(),
  getAttendanceHistory: jest.fn(),
}));

const courses = [{ course_id: 4, course_code: 'CS301', course_name: 'Database Systems' }];
const records = [{
  attendance_id: 1,
  attendance_date: '2026-10-20',
  status: 'Present',
  course_code: 'CS301',
  course_name: 'Database Systems',
  section: 'A',
}];

let container;
let root;

async function renderDashboard() {
  await act(async () => {
    root.render(<StudentDashboard />);
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
  useAuth.mockReturnValue({ user: { fullName: 'Student User' }, logout: jest.fn() });
  studentService.getEnrolledCourses.mockResolvedValue({ courses });
  studentService.getAttendanceHistory.mockResolvedValue({ records });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('loads courses and the authenticated student history', async () => {
  await renderDashboard();
  expect(studentService.getEnrolledCourses).toHaveBeenCalledTimes(1);
  expect(studentService.getAttendanceHistory).toHaveBeenCalledWith({});
  expect(container.textContent).toContain('Student User');
  expect(container.textContent).toContain('CS301');
  expect(container.textContent).toContain('Present');
});

test('applies course and date filters and clears stale results while editing', async () => {
  await renderDashboard();
  changeValue(container.querySelector('#history-course'), '4');
  expect(container.textContent).not.toContain('2026-10-20');
  changeValue(container.querySelector('#history-date'), '2026-10-20');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
  });
  expect(studentService.getAttendanceHistory).toHaveBeenLastCalledWith({ courseId: '4', date: '2026-10-20' });
  expect(container.textContent).toContain('2026-10-20');
});

test('shows a valid empty result message', async () => {
  studentService.getAttendanceHistory.mockResolvedValue({ records: [] });
  await renderDashboard();
  expect(container.textContent).toContain('No attendance records found');
});

test('shows retry controls when history retrieval fails', async () => {
  studentService.getAttendanceHistory.mockRejectedValueOnce(new Error('History unavailable'));
  await renderDashboard();
  expect(container.textContent).toContain('History unavailable');
  expect(container.querySelector('[role="alert"] .student-secondary-button').textContent).toBe('Try again');
});

test('rejects invalid date values before making a filtered request', async () => {
  await renderDashboard();
  changeValue(container.querySelector('#history-date'), '2026-02-30');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
  });
  expect(container.textContent).toContain('Enter a valid attendance date');
  expect(studentService.getAttendanceHistory).toHaveBeenCalledTimes(1);
});
