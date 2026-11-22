window.Cohere = window.Cohere || {};
Cohere.Validators = (function () {
    "use strict";

    // Validates organization form values
    function validateOrg(values, editingId) {
        const errors = {};
        const name = (values.name || "").trim();
        const description = (values.description || "").trim();

        // Name: required, 3-60 chars
        if (!name || name.length < 3 || name.length > 60) {
            errors["org-name"] = "Organization name is required (3–60 characters).";
        }

        // Name: unique (ignore case)
        if (!errors["org-name"]) {
            const duplicate = window.Cohere.state.organizations.some(function (o) {
                return o.id !== editingId && o.name.toLowerCase() === name.toLowerCase();
            });
            if (duplicate) {
                errors["org-name"] = "That organization already exists.";
            }
        }

        // Description: optional, up to 200 chars
        if (description.length > 200) {
            errors["org-desc"] = "Description is too long (max 200).";
        }

        return { valid: Object.keys(errors).length === 0, errors: errors };
    }

    // Validates member form values
    function validateMember(values, editingId) {
        const errors = {};
        const fullName = (values.fullName || "").trim();
        const studentId = (values.studentId || "").trim();
        const orgId = values.orgId || "";
        const position = values.position || "";
        const yearSection = (values.yearSection || "").trim();
        const email = (values.email || "").trim();

        // Full name: required, 2-60 chars, letters/spaces/.  ' - only
        if (!fullName || fullName.length < 2 || fullName.length > 60) {
            errors["member-fullName"] = "Enter a valid full name.";
        } else if (!/^[A-Za-z\s.'\-]+$/.test(fullName)) {
            errors["member-fullName"] = "Enter a valid full name.";
        }

        // Student ID: required, /^[A-Za-z0-9-]{4,20}$/, unique
        if (!studentId || !/^[A-Za-z0-9-]{4,20}$/.test(studentId)) {
            errors["member-studentId"] = "Enter a valid student ID.";
        } else {
            const duplicate = window.Cohere.state.members.some(function (m) {
                return m.id !== editingId && m.studentId === studentId;
            });
            if (duplicate) {
                errors["member-studentId"] = "This student ID is already registered.";
            }
        }

        // Organization: required
        if (!orgId) {
            errors["member-orgId"] = "Select an organization.";
        } else if (!Cohere.Store.getOrg(orgId)) {
            errors["member-orgId"] = "Select an organization.";
        }

        // Position: required
        if (!position || !Cohere.Config.POSITIONS.includes(position)) {
            errors["member-position"] = "Select a position.";
        }

        // Year/section: optional, up to 20 chars
        if (yearSection.length > 20) {
            errors["member-yearSection"] = "Year/section is too long.";
        }

        // Email: optional, valid format
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors["member-email"] = "Enter a valid email address.";
        }

        return { valid: Object.keys(errors).length === 0, errors: errors };
    }

    // Validates task form values
    // editingId is optional: when provided, an unchanged past deadline is allowed
    // (so an already-overdue task can still be edited/completed)
    function validateTask(values, editingId) {
        const errors = {};
        const title = (values.title || "").trim();
        const description = (values.description || "").trim();
        const assigneeId = values.assigneeId || "";
        const priority = values.priority || "";
        const deadline = values.deadline || "";
        const status = values.status || "";
        const completedAt = values.completedAt || "";

        // Title: required, 1-120 chars
        if (!title) {
            errors["task-title"] = "Task title is required (3–80 characters).";
        } else if (title.length > 80) {
            errors["task-title"] = "Title is too long (max 80).";
        }

        // Description: optional, up to 500 chars
        if (description.length > 300) {
            errors["task-description"] = "Description is too long (max 300).";
        }

        // Assignee: required and must exist
        if (!assigneeId) {
            errors["task-assigneeId"] = "Choose who this task is assigned to.";
        } else if (!Cohere.Store.getMember(assigneeId)) {
            errors["task-assigneeId"] = "Select a valid assignee.";
        }

        // Priority: must be one of the config values
        if (!priority || !Cohere.Config.PRIORITIES.includes(priority)) {
            errors["task-priority"] = "Select a priority.";
        }

        // Deadline: required, valid ISO date, and not in the past
        if (!deadline) {
            errors["task-deadline"] = "Deadline is required.";
        } else if (!Cohere.Utils.isValidISODate(deadline)) {
            errors["task-deadline"] = "Enter a valid deadline.";
        } else if (deadline < Cohere.Utils.todayISO()) {
            // On edit, allow keeping an unchanged past deadline (e.g. an overdue task)
            let unchangedPastDeadline = false;
            if (editingId) {
                const existing = Cohere.Store.getTask(editingId);
                if (existing && existing.deadline === deadline) {
                    unchangedPastDeadline = true;
                }
            }
            if (!unchangedPastDeadline) {
                errors["task-deadline"] = "Deadline cannot be in the past.";
            }
        }

        // Status: must be one of the config values
        if (!status || !Cohere.Config.TASK_STATUSES.includes(status)) {
            errors["task-status"] = "Select a status.";
        }

        // Completion date: required only when status is Completed
        if (status === "Completed") {
            if (!completedAt) {
                errors["task-completedAt"] = "Enter the completion date.";
            } else if (!Cohere.Utils.isValidISODate(completedAt)) {
                errors["task-completedAt"] = "Enter a valid completion date.";
            } else if (completedAt > Cohere.Utils.todayISO()) {
                errors["task-completedAt"] = "Completion date cannot be in the future.";
            }
        }

        return { valid: Object.keys(errors).length === 0, errors: errors };
    }

    // Validates appointment form values
    function validateAppointment(values, editingId) {
        const errors = {};
        const title = (values.title || "").trim();
        const date = (values.date || "").trim();
        const startTime = (values.startTime || "").trim();
        const endTime = (values.endTime || "").trim();
        const location = (values.location || "").trim();
        const memberIds = values.memberIds || [];

        if (!title || title.length < 3 || title.length > 80) {
            errors["appt-title"] = "Meeting title is required (3–80 characters).";
        }
        if (!date || !Cohere.Utils.isValidISODate(date)) {
            errors["appt-date"] = "Enter a valid date.";
        } else {
            let unchangedPastDate = false;
            if (editingId) {
                const existing = Cohere.Store.getAppointment(editingId);
                if (existing && existing.date === date) unchangedPastDate = true;
            }
            if (!unchangedPastDate && date < Cohere.Utils.todayISO()) {
                errors["appt-date"] = "Date cannot be in the past.";
            }
        }
        if (!startTime) {
            errors["appt-start"] = "Enter a start time.";
        }
        if (!endTime) {
            errors["appt-end"] = "Enter an end time.";
        } else if (startTime && endTime <= startTime) {
            errors["appt-end"] = "End time must be after start time.";
        }
        if (!location || location.length < 2 || location.length > 60) {
            errors["appt-location"] = "Enter the meeting location.";
        }
        if (!memberIds || memberIds.length < 2) {
            errors["appt-members"] = "Invite at least two officers.";
        } else {
            const allExist = memberIds.every(function (id) { return Cohere.Store.getMember(id) !== null; });
            if (!allExist) errors["appt-members"] = "Invite at least two officers.";
        }
        return { valid: Object.keys(errors).length === 0, errors: errors };
    }

    return { validateOrg, validateMember, validateTask, validateAppointment };
})();