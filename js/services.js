window.Cohere = window.Cohere || {};
Cohere.Services = (function () {
    "use strict";

    // Returns true if the task is not Completed and its deadline is before today
    function isOverdue(task) {
        if (!task) return false;
        if (task.status === "Completed") return false;
        if (!task.deadline) return false;
        return task.deadline < Cohere.Utils.todayISO();
    }

    // Returns true if the task is Completed and completedAt is on or before deadline
    function isOnTime(task) {
        if (!task) return false;
        if (task.status !== "Completed") return false;
        if (!task.completedAt) return false;
        if (!task.deadline) return true;
        return task.completedAt <= task.deadline;
    }

    // Returns the number of days between two ISO dates (to - from)
    function daysBetween(fromISO, toISO) {
        const a = new Date(fromISO);
        const b = new Date(toISO);
        return Math.round((b - a) / (1000 * 60 * 60 * 24));
    }

    // Returns the list of appointments that conflict with the candidate
    function findConflicts(candidate, excludeId) {
        return window.Cohere.state.appointments.filter(function (a) {
            return a.id !== excludeId &&
                a.status !== "Cancelled" &&
                a.date === candidate.date &&
                a.startTime < candidate.endTime &&
                candidate.startTime < a.endTime &&
                a.memberIds.some(function (id) { return candidate.memberIds.includes(id); });
        });
    }

    // Returns performance statistics for a single officer
    function getOfficerStats(memberId) {
        const state = window.Cohere.state;
        const member = state.members.find(function (m) { return m.id === memberId; });
        if (!member) return null;

        // Task stats
        const tasks = state.tasks.filter(function (t) { return t.assigneeId === memberId; });
        const assigned = tasks.length;
        const completed = tasks.filter(function (t) { return t.status === "Completed"; }).length;
        const completedOnTime = tasks.filter(function (t) { return isOnTime(t); }).length;
        const overdue = tasks.filter(function (t) { return isOverdue(t); }).length;

        // Attendance stats (only count appointments that still exist and are not Cancelled)
        const validApptIds = state.appointments
            .filter(function (a) { return a.status !== "Cancelled"; })
            .map(function (a) { return a.id; });

        const attendanceRecords = state.attendance.filter(function (a) {
            return a.memberId === memberId && validApptIds.includes(a.appointmentId);
        });

        const present = attendanceRecords.filter(function (a) { return a.status === "present"; }).length;
        const absent = attendanceRecords.filter(function (a) { return a.status === "absent"; }).length;
        const excused = attendanceRecords.filter(function (a) { return a.status === "excused"; }).length;

        // Rates (prevent division by zero)
        const taskCompletionRate = assigned > 0 ? (completed / assigned) * 100 : null;
        const onTimeRate = completed > 0 ? (completedOnTime / completed) * 100 : null;
        const attendanceRate = (present + absent) > 0 ? (present / (present + absent)) * 100 : null;

        // Overall score (weighted average of non-null rates)
        const weights = Cohere.Config.WEIGHTS || { task: 0.4, onTime: 0.3, attendance: 0.3 };
        let sumWeighted = 0;
        let sumWeights = 0;
        if (taskCompletionRate !== null) { sumWeighted += weights.task * taskCompletionRate; sumWeights += weights.task; }
        if (onTimeRate !== null) { sumWeighted += weights.onTime * onTimeRate; sumWeights += weights.onTime; }
        if (attendanceRate !== null) { sumWeighted += weights.attendance * attendanceRate; sumWeights += weights.attendance; }

        const overallScore = sumWeights > 0 ? sumWeighted / sumWeights : null;

        // Rating labels
        let rating = "No data";
        if (overallScore !== null) {
            if (overallScore >= 90) rating = "Excellent";
            else if (overallScore >= 75) rating = "Good";
            else if (overallScore >= 50) rating = "Fair";
            else rating = "Needs Improvement";
        }

        return {
            memberId: member.id,
            fullName: member.fullName,
            position: member.position,
            orgId: member.orgId,
            assigned: assigned,
            completed: completed,
            completedOnTime: completedOnTime,
            overdue: overdue,
            present: present,
            absent: absent,
            excused: excused,
            taskCompletionRate: taskCompletionRate,
            onTimeRate: onTimeRate,
            attendanceRate: attendanceRate,
            overallScore: overallScore,
            rating: rating
        };
    }

    // Returns performance statistics for all officers, optionally filtered by organization
    function getAllStats(orgId) {
        const state = window.Cohere.state;
        let members = state.members;
        if (orgId) {
            members = members.filter(function (m) { return m.orgId === orgId; });
        }

        const stats = members.map(function (m) {
            return getOfficerStats(m.id);
        }).filter(function (s) { return s !== null; });

        // Default sort: by overallScore descending (nulls at the bottom)
        stats.sort(function (a, b) {
            if (a.overallScore === null && b.overallScore === null) return 0;
            if (a.overallScore === null) return 1;
            if (b.overallScore === null) return -1;
            return b.overallScore - a.overallScore;
        });

        return stats;
    }

    // Returns a compact set of stats for the Dashboard view
    function getDashboardStats() {
        const state = window.Cohere.state;
        const today = Cohere.Utils.todayISO();
        const dueSoonEnd = Cohere.Utils.addDays(today, Cohere.Config.REMINDER_DAYS);
        const nowIso = today; // date-only comparison for upcoming meetings

        const tasks = state.tasks || [];
        const appointments = state.appointments || [];
        const members = state.members || [];

        // Stat cards
        const totalMembers = members.length;
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(function (t) { return t.status === "Completed"; }).length;
        const overdueTasks = tasks.filter(function (t) { return isOverdue(t); }).length;
        const totalMeetings = appointments.length;
        const upcomingMeetings = appointments.filter(function (a) {
            return a.status === "Scheduled" && a.date >= nowIso;
        }).length;

        // Average attendance rate across officers (excluding nulls)
        const officers = members.map(function (m) { return getOfficerStats(m.id); }).filter(Boolean);
        const attendanceValues = officers
            .map(function (o) { return o.attendanceRate; })
            .filter(function (v) { return v !== null && v !== undefined; });
        const averageAttendanceRate = attendanceValues.length
            ? attendanceValues.reduce(function (a, b) { return a + b; }, 0) / attendanceValues.length
            : null;

        // Task status counts for the bars
        const taskStatusCounts = { "Pending": 0, "In Progress": 0, "Completed": 0 };
        tasks.forEach(function (t) {
            if (taskStatusCounts[t.status] !== undefined) taskStatusCounts[t.status]++;
        });

        // Due soon: not completed, deadline within [today, today + REMINDER_DAYS]
        const dueSoon = tasks
            .filter(function (t) {
                return t.status !== "Completed" &&
                    t.deadline &&
                    t.deadline >= today &&
                    t.deadline <= dueSoonEnd;
            })
            .sort(function (a, b) { return (a.deadline || "").localeCompare(b.deadline || ""); })
            .slice(0, 5);

        // Upcoming meetings: scheduled, on/after today, sorted by date + startTime
        const upcoming = appointments
            .filter(function (a) { return a.status === "Scheduled" && a.date >= nowIso; })
            .sort(function (a, b) {
                if (a.date === b.date) return (a.startTime || "").localeCompare(b.startTime || "");
                return (a.date || "").localeCompare(b.date || "");
            })
            .slice(0, 5);

        // Top officers: overallScore != null, top 3 desc
        const topOfficers = officers
            .filter(function (o) { return o.overallScore !== null; })
            .sort(function (a, b) { return b.overallScore - a.overallScore; })
            .slice(0, 3);

        // Recent activity: last 5
        const recentActivity = (state.activity || []).slice(0, 5);

        return {
            totalMembers,
            totalTasks,
            completedTasks,
            overdueTasks,
            totalMeetings,
            upcomingMeetings,
            averageAttendanceRate,
            taskStatusCounts,
            dueSoon,
            upcoming,
            topOfficers,
            recentActivity
        };
    }

    // Returns a member's open/in-progress tasks, sorted by deadline asc, capped at 5
    function getMyTasks(memberId) {
        if (!memberId) return [];
        const state = window.Cohere.state;
        return (state.tasks || [])
            .filter(function (t) { return t.assigneeId === memberId && t.status !== "Completed"; })
            .sort(function (a, b) { return (a.deadline || "").localeCompare(b.deadline || ""); })
            .slice(0, 5);
    }

    // Generates deadline reminders for tasks due within REMINDER_DAYS or overdue (M7)
    function generateDeadlineReminders() {
        const state = window.Cohere.state;
        if (!state || !state.tasks) return;

        const today = Cohere.Utils.todayISO();
        const reminderDays = Cohere.Config.REMINDER_DAYS || 2;
        const dueSoonEnd = Cohere.Utils.addDays(today, reminderDays);

        state.tasks.forEach(function (task) {
            if (task.status === "Completed" || !task.deadline) return;

            let message = "";
            if (task.deadline < today) {
                message = "Task '" + task.title + "' is overdue.";
            } else if (task.deadline <= dueSoonEnd) {
                const daysUntil = daysBetween(today, task.deadline);
                if (daysUntil === 0) {
                    message = "Task '" + task.title + "' is due today.";
                } else if (daysUntil === 1) {
                    message = "Task '" + task.title + "' is due tomorrow.";
                } else {
                    message = "Task '" + task.title + "' is due in " + daysUntil + " days.";
                }
            } else {
                return; // Not due soon
            }

            // Skip if a notification with the same refId, type "deadline" and same calendar date already exists
            const alreadyNotified = state.notifications.some(function (n) {
                return n.refId === task.id &&
                    n.type === "deadline" &&
                    n.timestamp.slice(0, 10) === today;
            });

            if (!alreadyNotified) {
                Cohere.Notify.add("deadline", message, task.assigneeId, task.id);
            }
        });
    }

    return {
        isOverdue,
        isOnTime,
        daysBetween,
        findConflicts,
        getOfficerStats,
        getAllStats,
        getDashboardStats,
        getMyTasks,
        generateDeadlineReminders
    };
})();