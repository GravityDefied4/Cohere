window.Cohere = window.Cohere || {};
/*
 * ACCOUNT DATA: the JavaScript file that stores user logins (no database).
 *
 * Roles (only these four):
 *   Admin      creates organizations and assigns each organization's President
 *   President  adds Executives and Members to their own organization
 *   Executive  officer of an organization (tasks, meetings, attendance)
 *   Member     regular member (view only)
 *
 * Fields: username, password, name, role, org (organization name), email, studentId
 * A person can sign in with their username, email or student ID.
 *
 * Presidents assigned by the Admin and members added by a President in the app
 * are kept in this browser. To make them permanent, open Settings > "Export
 * accounts file" (Admin) and replace this file with the downloaded one.
 *
 * NOTE: this file is sent to the browser, so anyone can read these passwords.
 * That is fine for a school project or demo, but it is not real security.
 */
Cohere.AccountData = [
    { username: "admin", password: "admin123", name: "Administrator", role: "Admin" },

    { username: "maria", password: "password123", name: "Maria Santos", role: "President", org: "Computer Society", email: "maria.001.stud@cdd.edu.ph", studentId: "21-1001-001" },
    { username: "ben", password: "password123", name: "Ben Lopez", role: "President", org: "Student Council", email: "ben.004.stud@cdd.edu.ph", studentId: "22-1004-004" },
    { username: "david", password: "password123", name: "David Tan", role: "President", org: "Arts and Culture Guild", email: "david.006.stud@cdd.edu.ph", studentId: "23-1006-006" },

    { username: "jose", password: "password123", name: "Jose Reyes", role: "Executive", org: "Computer Society", email: "jose.002.stud@cdd.edu.ph", studentId: "21-1002-002" },
    { username: "ana", password: "password123", name: "Ana Cruz", role: "Executive", org: "Computer Society", email: "ana.003.stud@cdd.edu.ph", studentId: "22-1003-003" },
    { username: "carla", password: "password123", name: "Carla Mendoza", role: "Executive", org: "Student Council", email: "carla.005.stud@cdd.edu.ph", studentId: "23-1005-005" },

    { username: "elena", password: "password123", name: "Elena Rivera", role: "Member", org: "Arts and Culture Guild", email: "elena.007.stud@cdd.edu.ph", studentId: "24-1007-007" }
];