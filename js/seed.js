window.Cohere = window.Cohere || {};
Cohere.Seed = (function () {
    "use strict";

    // Generates a full set of sample data for demo/reset purposes.
    // Uses today's date as the anchor so tasks/meetings always look current.
    function generate() {
        const today = Cohere.Utils.todayISO();
        const yesterday = Cohere.Utils.addDays(today, -1);
        const tomorrow = Cohere.Utils.addDays(today, 1);
        const inTwoDays = Cohere.Utils.addDays(today, 2);
        const inFiveDays = Cohere.Utils.addDays(today, 5);
        const lastWeek = Cohere.Utils.addDays(today, -7);

        // ---- Organizations ----
        const organizations = [
            { id: Cohere.Utils.generateId("org"), name: "Computer Society", description: "Organization for IT students", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("org"), name: "Student Council", description: "Student government", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("org"), name: "Arts and Culture Guild", description: "Organization for arts enthusiasts", createdAt: lastWeek }
        ];
        const orgCS = organizations[0].id;
        const orgSC = organizations[1].id;
        const orgAC = organizations[2].id;

        // ---- Members (spread across orgs, varied positions) ----
        const members = [
            { id: Cohere.Utils.generateId("mem"), fullName: "Maria Santos", studentId: "21-1001-001", orgId: orgCS, role: "President", position: "President", status: "Active", yearSection: "4-A", email: "maria.001.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "Jose Reyes", studentId: "21-1002-002", orgId: orgCS, role: "Executive", position: "Vice President", status: "Active", yearSection: "3-B", email: "jose.002.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "Ana Cruz", studentId: "22-1003-003", orgId: orgCS, role: "Executive", position: "Secretary", status: "Active", yearSection: "3-A", email: "ana.003.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "Ben Lopez", studentId: "22-1004-004", orgId: orgSC, role: "President", position: "President", status: "Active", yearSection: "4-B", email: "ben.004.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "Carla Mendoza", studentId: "23-1005-005", orgId: orgSC, role: "Executive", position: "Treasurer", status: "Active", yearSection: "2-A", email: "carla.005.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "David Tan", studentId: "23-1006-006", orgId: orgAC, role: "President", position: "President", status: "Active", yearSection: "2-B", email: "david.006.stud@cdd.edu.ph", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("mem"), fullName: "Elena Rivera", studentId: "24-1007-007", orgId: orgAC, role: "Member", position: "Representative", status: "Active", yearSection: "1-A", email: "elena.007.stud@cdd.edu.ph", createdAt: lastWeek }
        ];
        const memMaria = members[0].id;
        const memJose = members[1].id;
        const memAna = members[2].id;
        const memBen = members[3].id;
        const memCarla = members[4].id;
        const memDavid = members[5].id;
        const memElena = members[6].id;

        // ---- Tasks (varied statuses/priorities/deadlines) ----
        const tasks = [
            { id: Cohere.Utils.generateId("task"), title: "Prepare org fair booth", description: "Coordinate with suppliers and design booth layout", assigneeId: memMaria, priority: "High", deadline: inTwoDays, status: "In Progress", completedAt: null, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Draft monthly report", description: "Summarize activities for the month", assigneeId: memJose, priority: "Medium", deadline: tomorrow, status: "Pending", completedAt: null, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Book meeting room", description: "Reserve room for next week's assembly", assigneeId: memAna, priority: "Low", deadline: yesterday, status: "Pending", completedAt: null, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Update org website", description: "Refresh home page content", assigneeId: memBen, priority: "Medium", deadline: today, status: "Completed", completedAt: today, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Plan welcome event", description: "Organize program for new members", assigneeId: memCarla, priority: "High", deadline: inFiveDays, status: "Pending", completedAt: null, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Collect membership forms", description: "Consolidate and digitize forms", assigneeId: memDavid, priority: "Medium", deadline: lastWeek, status: "Completed", completedAt: lastWeek, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Design recruitment poster", description: "Create posters for upcoming recruitment", assigneeId: memElena, priority: "Low", deadline: inFiveDays, status: "In Progress", completedAt: null, createdAt: lastWeek },
            { id: Cohere.Utils.generateId("task"), title: "Review budget proposal", description: "Check line items and approve", assigneeId: memCarla, priority: "High", deadline: tomorrow, status: "Pending", completedAt: null, createdAt: lastWeek }
        ];

        // ---- Appointments (past, today, future) ----
        const appointments = [
            { id: Cohere.Utils.generateId("appt"), title: "General Assembly", date: lastWeek, startTime: "09:00", endTime: "11:00", location: "Room 201", notes: "Quarterly assembly", memberIds: [memMaria, memJose, memAna, memBen], status: "Completed", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("appt"), title: "Officer Meeting", date: today, startTime: "08:00", endTime: "09:00", location: "Room 105", notes: "Weekly sync", memberIds: [memMaria, memJose, memBen, memCarla], status: "Scheduled", createdAt: lastWeek },
            { id: Cohere.Utils.generateId("appt"), title: "Org Fair Planning", date: inFiveDays, startTime: "14:00", endTime: "16:00", location: "Auditorium", notes: "Plan the fair", memberIds: [memMaria, memAna, memDavid, memElena], status: "Scheduled", createdAt: lastWeek }
        ];
        const apptPast = appointments[0].id;

        // ---- Attendance (for the past assembly) ----
        const attendance = [
            { id: Cohere.Utils.generateId("att"), appointmentId: apptPast, memberId: memMaria, status: "present", markedAt: lastWeek + "T09:05:00Z" },
            { id: Cohere.Utils.generateId("att"), appointmentId: apptPast, memberId: memJose, status: "present", markedAt: lastWeek + "T09:06:00Z" },
            { id: Cohere.Utils.generateId("att"), appointmentId: apptPast, memberId: memAna, status: "absent", markedAt: lastWeek + "T09:07:00Z" },
            { id: Cohere.Utils.generateId("att"), appointmentId: apptPast, memberId: memBen, status: "excused", markedAt: lastWeek + "T09:08:00Z" }
        ];

        // ---- Activity entries ----
        const activity = [
            { id: Cohere.Utils.generateId("act"), type: "settings", message: "Loaded sample data", actorId: "admin", actorName: "Administrator", timestamp: new Date().toISOString() },
            { id: Cohere.Utils.generateId("act"), type: "organization", message: "Created organization \"Computer Society\"", actorId: "admin", actorName: "Administrator", timestamp: new Date(Date.now() - 3000).toISOString() },
            { id: Cohere.Utils.generateId("act"), type: "member", message: "Added member \"Maria Santos\"", actorId: "admin", actorName: "Administrator", timestamp: new Date(Date.now() - 2000).toISOString() },
            { id: Cohere.Utils.generateId("act"), type: "task", message: "Created task \"Prepare org fair booth\"", actorId: "admin", actorName: "Administrator", timestamp: new Date(Date.now() - 1000).toISOString() }
        ];

        return {
            organizations,
            members,
            tasks,
            appointments,
            attendance,
            activity,
            notifications: [],
            settings: { seeded: true, schemaVersion: 1, viewingAs: "admin" }
        };
    }

    return { generate };
})();