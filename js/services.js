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

    return { isOverdue, isOnTime, findConflicts, getOfficerStats, getAllStats };
})();