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

    return { isOverdue, isOnTime, findConflicts };
})();