const facultyModel = require('../models/facultyModel');

function parseClassId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const classId = Number(value);
  return Number.isSafeInteger(classId) && classId > 0 ? classId : null;
}

function isValidAttendanceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12) return false;

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

async function getAssignedClasses(req, res) {
  try {
    const classes = await facultyModel.listAssignedClasses(req.user.userId);
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('[Faculty] Assigned class lookup failed:', err.message);
    return res.status(500).json({ message: 'Unable to load assigned classes. Please try again.' });
  }
}

async function getClassRoster(req, res) {
  const classId = parseClassId(req.params.classId);
  if (classId === null) {
    return res.status(400).json({ message: 'Select a valid assigned class.' });
  }

  const date = req.query.date;
  if (!isValidAttendanceDate(date)) {
    return res.status(400).json({ message: 'Enter a valid attendance date in YYYY-MM-DD format.' });
  }

  try {
    const selectedClass = await facultyModel.getAssignedClassRoster(req.user.userId, classId);
    if (!selectedClass) {
      // Do not reveal whether an unassigned class exists.
      return res.status(404).json({ message: 'Class not found or not assigned to you.' });
    }

    return res.status(200).json({
      class: {
        classId: selectedClass.classId,
        courseId: selectedClass.courseId,
        courseCode: selectedClass.courseCode,
        courseName: selectedClass.courseName,
        section: selectedClass.section,
        academicYear: selectedClass.academicYear,
      },
      date,
      students: selectedClass.students,
    });
  } catch (err) {
    console.error('[Faculty] Class roster lookup failed:', err.message);
    return res.status(500).json({ message: 'Unable to load this class roster. Please try again.' });
  }
}

module.exports = { getAssignedClasses, getClassRoster, isValidAttendanceDate };
