import React from 'react';
import ReactDOM from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as reportService from '../../services/reportService';
import AttendanceReportPage from './AttendanceReportPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/reportService', () => ({
  getReportClasses: jest.fn(),
  getReportStudents: jest.fn(),
  generateAttendanceReport: jest.fn(),
}));

const availableClasses = [
  { classId: 10, courseId: 3, courseCode: 'CS301', courseName: 'Algorithms', section: 'B', academicYear: '2026-27' },
  { classId: 11, courseId: 4, courseCode: 'MA201', courseName: 'Linear Algebra', section: null, academicYear: '2026-27' },
];

const generatedReport = {
  class: { classId: 10, courseId: 3, courseCode: 'CS301', courseName: 'Algorithms', section: 'B', academicYear: '2026-27' },
  dateRange: { from: '2026-10-01', to: '2026-10-31' },
  generatedAt: '2026-11-01T10:00:00.000Z',
  threshold: 75,
  summary: {
    studentCount: 1,
    totalEligibleClasses: 2,
    overallAttendancePercentage: 50,
    averageAttendancePercentage: 50,
    belowThresholdCount: 1,
  },
  students: [{
    studentId: 1,
    studentNumber: 'PES1',
    fullName: 'Asha Student',
    presentCount: 1,
    lateCount: 0,
    absentCount: 1,
    attendanceCount: 1,
    eligibleClassesHeld: 2,
    attendancePercentage: 50,
    belowThreshold: true,
  }],
};

let container;
let root;

async function renderPage() {
  await act(async () => {
    root.render(<AttendanceReportPage />);
    await Promise.resolve();
  });
}

async function setField(selector, value) {
  await act(async () => {
    const field = container.querySelector(selector);
    field.value = value;
    Simulate.change(field);
  });
}

async function chooseReportFilters() {
  await setField('#report-course', '3');
  await setField('#report-class', '10');
  await act(async () => { await Promise.resolve(); });
  await setField('#report-from', '2026-10-01');
  await setField('#report-to', '2026-10-31');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = ReactDOM.createRoot(container);
  useNavigate.mockReturnValue(jest.fn());
  useAuth.mockReturnValue({ user: { role: 'faculty' }, logout: jest.fn() });
  reportService.getReportClasses.mockResolvedValue({ classes: availableClasses });
  reportService.getReportStudents.mockResolvedValue({ students: [{ studentId: 1, studentNumber: 'PES1', fullName: 'Asha Student' }] });
  reportService.generateAttendanceReport.mockResolvedValue(generatedReport);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('loads authorized classes and shows a generated class/date-range report', async () => {
  await renderPage();
  expect(container.textContent).toContain('Attendance reports');
  expect(container.querySelector('#report-course').options).toHaveLength(3);

  await chooseReportFilters();
  expect(container.querySelector('#report-class').options).toHaveLength(2);
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(reportService.generateAttendanceReport).toHaveBeenCalledWith({
    courseId: '3', classId: '10', from: '2026-10-01', to: '2026-10-31',
  });
  expect(container.textContent).toContain('2026-10-01 through 2026-10-31');
  expect(container.textContent).toContain('Asha Student');
  expect(container.textContent).toContain('50.00%');
  expect(container.textContent).toContain('Below 75%');
});

test('rejects a reversed range in the UI and shows an empty attendance state', async () => {
  await renderPage();
  await chooseReportFilters();
  await setField('#report-from', '2026-11-01');
  await act(async () => { Simulate.submit(container.querySelector('form')); });
  expect(container.textContent).toContain('The end date must be on or after the start date.');
  expect(reportService.generateAttendanceReport).not.toHaveBeenCalled();

  reportService.generateAttendanceReport.mockResolvedValueOnce({
    ...generatedReport,
    summary: { ...generatedReport.summary, studentCount: 0, overallAttendancePercentage: null, averageAttendancePercentage: null },
    students: [],
  });
  await setField('#report-from', '2026-10-01');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(container.textContent).toContain('No attendance records found for the selected class and date range.');
});

test('loads students for the selected class and combines the student with existing report filters', async () => {
  await renderPage();
  await chooseReportFilters();
  await setField('#report-student', '1');
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(reportService.getReportStudents).toHaveBeenCalledWith('10');
  expect(reportService.generateAttendanceReport).toHaveBeenCalledWith({
    courseId: '3', classId: '10', studentId: '1', from: '2026-10-01', to: '2026-10-31',
  });
});
