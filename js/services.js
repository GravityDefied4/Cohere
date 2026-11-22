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

    return { isOverdue, isOnTime, daysBetween };
})();