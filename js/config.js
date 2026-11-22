window.Cohere = window.Cohere || {};
Cohere.Config = (function () {
    "use strict";

    const KEYS = {
        orgs: "cohere.v1.organizations",
        members: "cohere.v1.members",
        tasks: "cohere.v1.tasks",
        appointments: "cohere.v1.appointments",
        attendance: "cohere.v1.attendance",
        activity: "cohere.v1.activity",
        notifications: "cohere.v1.notifications",
        settings: "cohere.v1.settings"
    };

    // Roles: Admin (account only), President, Executive, Member
    const ROLES = ["President", "Executive", "Member"];
    const MEMBER_STATUSES = ["Active", "Inactive"];
    const PRIORITIES = ["Low", "Medium", "High"];
    const TASK_STATUSES = ["Pending", "In Progress", "Completed"];
    const APPT_STATUSES = ["Scheduled", "Completed", "Cancelled"];
    const ATT_STATUSES = ["present", "absent", "excused"];
    const WEIGHTS = { task: 0.4, onTime: 0.3, attendance: 0.3 };
    const REMINDER_DAYS = 2;
    const MAX_ACTIVITY = 200;
    const MAX_NOTIFICATIONS = 100;

    // M9: Actions and Permissions
    const ACTIONS = ["viewActivity", "viewSettings", "manageOrgs", "assignPresident", "manageMembers", "manageTasks", "manageMeetings", "markAttendance", "manageData"];

    // Admin can do everything (see Permissions.can). Only Admin can view the Activity log and Settings.
    // President: manage members, tasks, meetings and attendance of their OWN organization.
    // Executive: same, but cannot add or change members. Member: view only.
    const PERMISSIONS = {
        "President": ["manageMembers", "manageTasks", "manageMeetings", "markAttendance"],
        "Executive": ["manageTasks", "manageMeetings", "markAttendance"],
        "Member": []
    };

    const ACTION_LABELS = {
        viewActivity: "view the activity log",
        viewSettings: "open settings",
        manageOrgs: "create or manage organizations",
        assignPresident: "assign a president",
        editOrgPicture: "change the organization picture",
        manageMembers: "manage members",
        manageTasks: "manage tasks",
        manageMeetings: "manage meetings",
        markAttendance: "mark attendance",
        manageData: "manage data"
    };

    return {
        KEYS, ROLES, MEMBER_STATUSES, PRIORITIES, TASK_STATUSES, APPT_STATUSES, ATT_STATUSES,
        WEIGHTS, REMINDER_DAYS, MAX_ACTIVITY, MAX_NOTIFICATIONS,
        ACTIONS, PERMISSIONS, ACTION_LABELS
    };
})();