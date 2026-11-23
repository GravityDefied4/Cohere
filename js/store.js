window.Cohere = window.Cohere || {};
Cohere.Store = (function () {
    "use strict";

    function getOrg(id) { return window.Cohere.state.organizations.find(function (o) { return o.id === id; }) || null; }
    function getMember(id) { return window.Cohere.state.members.find(function (m) { return m.id === id; }) || null; }
    function getMemberName(id) { const m = getMember(id); return m ? m.fullName : "Unknown officer"; }
    function getTask(id) { return window.Cohere.state.tasks.find(function (t) { return t.id === id; }) || null; }
    function getAppointment(id) { return window.Cohere.state.appointments.find(function (a) { return a.id === id; }) || null; }

    // The organization a task / meeting belongs to (used to keep each organization's data separate)
    function taskOrgId(task) {
        const m = task ? getMember(task.assigneeId) : null;
        return m ? m.orgId : null;
    }
    function apptOrgId(appt) {
        if (!appt) return null;
        if (appt.orgId) return appt.orgId;
        for (let i = 0; i < (appt.memberIds || []).length; i++) {
            const m = getMember(appt.memberIds[i]);
            if (m) return m.orgId;
        }
        return null;
    }
    // Tasks the signed-in person may see: Admin sees all, everyone else only their own organization's
    function visibleTasks() {
        return window.Cohere.state.tasks.filter(function (t) {
            return Cohere.Permissions.canManageOrgData(taskOrgId(t));
        });
    }
    // Non-admins may only involve members of their own organization
    function allInOwnOrg(memberIds) {
        const actor = Cohere.Permissions.getActor();
        if (actor.isAdmin) return true;
        return memberIds.every(function (id) { const m = getMember(id); return m && m.orgId === actor.orgId; });
    }
    // True when the member record is one of the signed-in person's own memberships
    function isOwnMembership(id) {
        const actor = Cohere.Permissions.getActor();
        return actor.id === id || (actor.memberIds || []).indexOf(id) !== -1;
    }
    const OTHER_ORG = "You can only manage data of your own organization.";

    function addOrg(values) {
        if (!Cohere.Permissions.can("manageOrgs")) return { ok: false, error: Cohere.Permissions.denyMessage("manageOrgs") };
        const org = { id: Cohere.Utils.generateId("org"), name: values.name.trim(), description: (values.description || "").trim(), createdAt: Cohere.Utils.todayISO() };
        window.Cohere.state.organizations.push(org);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Created organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    function updateOrg(id, values) {
        if (!Cohere.Permissions.can("manageOrgs")) return { ok: false, error: Cohere.Permissions.denyMessage("manageOrgs") };
        const org = getOrg(id);
        if (!org) return { ok: false, error: "Organization not found." };
        const oldName = org.name;
        org.name = values.name.trim();
        org.description = (values.description || "").trim();
        if (oldName !== org.name) Cohere.Accounts.renameOrg(oldName, org.name);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Updated organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    // Sets (data URL) or clears (null) the logo of an organization.
    // Allowed for the Admin and for the President of that organization only.
    const PICTURE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
    const MAX_PICTURE_CHARS = 300000;
    function setOrgPicture(id, dataUrl) {
        const org = getOrg(id);
        if (!org) return { ok: false, error: "Organization not found." };
        if (!Cohere.Permissions.canEditOrgPicture(id)) {
            return { ok: false, error: "Only the Admin or this organization's President can change its logo." };
        }
        if (dataUrl) {
            if (!PICTURE_PATTERN.test(dataUrl)) return { ok: false, error: "That image format is not supported." };
            if (dataUrl.length > MAX_PICTURE_CHARS) return { ok: false, error: "That image is too large. Try a smaller one." };
            org.picture = dataUrl;
        } else {
            delete org.picture;
        }
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", (dataUrl ? "Changed" : "Removed") + " the logo of organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }
    function deleteOrg(id) {
        if (!Cohere.Permissions.can("manageOrgs")) return { ok: false, error: Cohere.Permissions.denyMessage("manageOrgs") };
        const org = getOrg(id);
        if (!org) return { ok: false, error: "Organization not found." };
        if (window.Cohere.state.members.some(function (m) { return m.orgId === id; })) {
            return { ok: false, error: "Cannot delete organization \"" + org.name + "\" because it still has members. Remove them first." };
        }
        window.Cohere.state.organizations = window.Cohere.state.organizations.filter(function (o) { return o.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Deleted organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    // Why the signed-in person cannot manage this member
    function memberDenied(member) {
        if (member.role === "President" && Cohere.Permissions.canManageOrgMembers(member.orgId)) {
            return "Only the Admin can change or remove a President.";
        }
        if (Cohere.Permissions.can("manageMembers")) return "You can only manage members of your own organization.";
        return Cohere.Permissions.denyMessage("manageMembers");
    }

    function getPresident(orgId) {
        return window.Cohere.state.members.find(function (m) { return m.orgId === orgId && m.role === "President"; }) || null;
    }

    // Admin only: makes someone the President of an organization (replacing the current one).
    // If the student ID already belongs to a member of that organization, that member is promoted.
    function assignPresident(orgId, values) {
        if (!Cohere.Permissions.can("assignPresident")) return { ok: false, error: Cohere.Permissions.denyMessage("assignPresident") };
        const org = getOrg(orgId);
        if (!org) return { ok: false, error: "Organization not found." };
        const studentId = values.studentId.trim();
        // A student can belong to several organizations: only a membership in THIS organization is promoted
        let person = window.Cohere.state.members.find(function (m) { return m.studentId === studentId && m.orgId === orgId; }) || null;

        const old = getPresident(orgId);
        if (old && (!person || old.id !== person.id)) {
            const oldAcc = Cohere.Accounts.findForMember(old);
            old.role = "Member";
            if (old.position === "President") old.position = "Member";
            Cohere.Accounts.syncMember(old, oldAcc);
        }

        let created;
        if (person) {
            const acc = Cohere.Accounts.findForMember(person);
            person.role = "President";
            person.position = "President";
            person.status = "Active";
            created = Cohere.Accounts.syncMember(person, acc);
        } else {
            person = { id: Cohere.Utils.generateId("mem"), fullName: values.fullName.trim(), studentId: studentId, orgId: orgId, role: "President", position: "President", status: "Active", yearSection: "", email: (values.email || "").trim(), createdAt: Cohere.Utils.todayISO() };
            window.Cohere.state.members.push(person);
            // A student who already has an account (member of another organization) keeps it
            created = Cohere.Accounts.syncMember(person, Cohere.Accounts.findForMember(person));
        }
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Assigned \"" + person.fullName + "\" as President of \"" + org.name + "\"");
        return { ok: true, data: person, account: created.account, created: created.created };
    }

    function addMember(values) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        if (!Cohere.Permissions.canManageOrgMembers(values.orgId)) return { ok: false, error: "You can only add members to your own organization." };
        if (values.role === "President") return { ok: false, error: "A President can only be assigned by the Admin." };
        const role = values.role;
        const specific = (values.specificRole || "").trim();
        const member = { id: Cohere.Utils.generateId("mem"), fullName: values.fullName.trim(), studentId: values.studentId.trim(), orgId: values.orgId, role: role, position: specific || role, status: "Active", yearSection: "", email: (values.email || "").trim(), createdAt: Cohere.Utils.todayISO() };
        window.Cohere.state.members.push(member);
        // A student who already has an account (member of another organization) keeps it
        const synced = Cohere.Accounts.syncMember(member, Cohere.Accounts.findForMember(member));
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Added " + role + " \"" + member.fullName + "\"");
        return { ok: true, data: member, account: synced.account, created: synced.created };
    }

    function updateMember(id, values) {
        const member = getMember(id);
        if (!member) return { ok: false, error: "Member not found." };
        if (!Cohere.Permissions.canManageMember(member)) return { ok: false, error: memberDenied(member) };
        const isAdmin = Cohere.Permissions.getActor().isAdmin;
        if (!isAdmin && values.orgId !== member.orgId) return { ok: false, error: "You cannot move a member to another organization." };
        if ((values.role === "President") !== (member.role === "President")) return { ok: false, error: "Presidents are assigned by the Admin. Use \"Assign president\"." };
        const acc = Cohere.Accounts.findForMember(member);
        member.fullName = values.fullName.trim();
        member.studentId = values.studentId.trim();
        member.orgId = values.orgId;
        member.role = values.role;
        member.position = (values.specificRole || "").trim() || values.role;
        member.email = (values.email || "").trim();
        Cohere.Accounts.syncMember(member, acc);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Updated member \"" + member.fullName + "\"");
        return { ok: true, data: member };
    }

    function setMemberStatus(id, status) {
        const member = getMember(id);
        if (!member) return { ok: false, error: "Member not found." };
        if (!Cohere.Permissions.canManageMember(member)) return { ok: false, error: memberDenied(member) };
        if (isOwnMembership(id)) return { ok: false, error: "You cannot deactivate your own account." };
        if (!Cohere.Config.MEMBER_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
        member.status = status;
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Marked \"" + member.fullName + "\" as " + status);
        return { ok: true, data: member };
    }

    function deleteMember(id) {
        const member = getMember(id);
        if (!member) return { ok: false, error: "Member not found." };
        if (!Cohere.Permissions.canManageMember(member)) return { ok: false, error: memberDenied(member) };
        if (isOwnMembership(id)) return { ok: false, error: "You cannot delete the member record of the account you are signed in with." };
        const memberTasks = window.Cohere.state.tasks.filter(function (t) { return t.assigneeId === id; });
        window.Cohere.state.tasks = window.Cohere.state.tasks.filter(function (t) { return t.assigneeId !== id; });
        window.Cohere.state.appointments.forEach(function (appt) { appt.memberIds = appt.memberIds.filter(function (mid) { return mid !== id; }); });
        window.Cohere.state.attendance = window.Cohere.state.attendance.filter(function (a) { return a.memberId !== id; });
        Cohere.Accounts.removeForMember(member);
        window.Cohere.state.members = window.Cohere.state.members.filter(function (m) { return m.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Deleted member \"" + member.fullName + "\"" + (memberTasks.length > 0 ? " and " + memberTasks.length + " task(s)" : ""));
        return { ok: true, data: member };
    }

    function addTask(values) {
        if (!Cohere.Permissions.can("manageTasks")) return { ok: false, error: Cohere.Permissions.denyMessage("manageTasks") };
        if (!allInOwnOrg([values.assigneeId])) return { ok: false, error: OTHER_ORG };
        const task = { id: Cohere.Utils.generateId("task"), title: values.title.trim(), description: (values.description || "").trim(), assigneeId: values.assigneeId, priority: values.priority, deadline: values.deadline, status: values.status, createdAt: Cohere.Utils.todayISO(), completedAt: values.status === "Completed" ? (values.completedAt || Cohere.Utils.todayISO()) : null };
        window.Cohere.state.tasks.push(task);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("task", "Created task \"" + task.title + "\"");
        Cohere.Notify.add("task", "You were assigned: \"" + task.title + "\"", task.assigneeId, task.id);
        return { ok: true, data: task };
    }

    function updateTask(id, values) {
        if (!Cohere.Permissions.can("manageTasks")) return { ok: false, error: Cohere.Permissions.denyMessage("manageTasks") };
        const task = getTask(id);
        if (!task) return { ok: false, error: "Task not found." };
        if (!Cohere.Permissions.canUpdateTask(task) || !allInOwnOrg([values.assigneeId])) return { ok: false, error: OTHER_ORG };
        task.title = values.title.trim();
        task.description = (values.description || "").trim();
        task.assigneeId = values.assigneeId;
        task.priority = values.priority;
        task.deadline = values.deadline;
        task.status = values.status;
        task.completedAt = values.status === "Completed" ? (values.completedAt || Cohere.Utils.todayISO()) : null;
        Cohere.Storage.saveAll();
        Cohere.Activity.log("task", "Updated task \"" + task.title + "\"");
        return { ok: true, data: task };
    }

    function setTaskStatus(id, status, completedAt) {
        const task = getTask(id);
        if (!task) return { ok: false, error: "Task not found." };
        if (!Cohere.Permissions.canUpdateTask(task)) return { ok: false, error: Cohere.Permissions.denyMessage("manageTasks") };
        if (!Cohere.Config.TASK_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
        task.status = status;
        task.completedAt = status === "Completed" ? (completedAt || Cohere.Utils.todayISO()) : null;
        Cohere.Storage.saveAll();
        Cohere.Activity.log("task", "Marked task \"" + task.title + "\" as " + status + ".");
        return { ok: true, data: task };
    }

    function deleteTask(id) {
        if (!Cohere.Permissions.can("manageTasks")) return { ok: false, error: Cohere.Permissions.denyMessage("manageTasks") };
        const task = getTask(id);
        if (!task) return { ok: false, error: "Task not found." };
        if (!Cohere.Permissions.canUpdateTask(task)) return { ok: false, error: OTHER_ORG };
        window.Cohere.state.tasks = window.Cohere.state.tasks.filter(function (t) { return t.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("task", "Deleted task \"" + task.title + "\"");
        return { ok: true, data: task };
    }

    // Adds a new appointment
    function addAppointment(values) {
        if (!Cohere.Permissions.can("manageMeetings")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMeetings") };
        if (!allInOwnOrg(values.memberIds)) return { ok: false, error: OTHER_ORG };
        const firstMember = getMember(values.memberIds[0]);
        const appt = {
            id: Cohere.Utils.generateId("appt"),
            orgId: Cohere.Permissions.getActor().isAdmin ? (firstMember ? firstMember.orgId : null) : Cohere.Permissions.getActor().orgId,
            title: values.title.trim(),
            date: values.date,
            startTime: values.startTime,
            endTime: values.endTime,
            meetingType: values.meetingType || "In-person",
            location: values.meetingType === "In-person" ? values.location.trim() : "",
            meetingLink: values.meetingType === "Online" ? values.meetingLink.trim() : "",
            memberIds: values.memberIds.slice(),
            notes: (values.notes || "").trim(),
            status: "Scheduled",
            createdAt: Cohere.Utils.todayISO()
        };
        window.Cohere.state.appointments.push(appt);
        Cohere.Storage.saveAll();
        const inviteeNames = appt.memberIds.map(getMemberName).join(", ");
        Cohere.Activity.log("appointment", "Scheduled event \"" + appt.title + "\" with " + inviteeNames);
        appt.memberIds.forEach(function (memberId) {
            Cohere.Notify.add("meeting", "You are invited to \"" + appt.title + "\" on " + Cohere.Utils.formatDate(appt.date), memberId, appt.id);
        });
        return { ok: true, data: appt };
    }

    // Updates an existing appointment
    function updateAppointment(id, values) {
        if (!Cohere.Permissions.can("manageMeetings")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMeetings") };
        const appt = getAppointment(id);
        if (!appt) return { ok: false, error: "Event not found." };
        if (!Cohere.Permissions.canManageMeeting(appt) || !allInOwnOrg(values.memberIds)) return { ok: false, error: OTHER_ORG };
        const oldMemberIds = appt.memberIds.slice();
        appt.title = values.title.trim();
        appt.date = values.date;
        appt.startTime = values.startTime;
        appt.endTime = values.endTime;
        appt.meetingType = values.meetingType || "In-person";
        appt.location = values.meetingType === "In-person" ? values.location.trim() : "";
        appt.meetingLink = values.meetingType === "Online" ? values.meetingLink.trim() : "";
        appt.memberIds = values.memberIds.slice();
        appt.notes = (values.notes || "").trim();
        Cohere.Storage.saveAll();
        Cohere.Activity.log("appointment", "Updated event \"" + appt.title + "\"");
        const newInvitees = appt.memberIds.filter(function (mid) { return !oldMemberIds.includes(mid); });
        newInvitees.forEach(function (memberId) {
            Cohere.Notify.add("meeting", "You are invited to \"" + appt.title + "\" on " + Cohere.Utils.formatDate(appt.date), memberId, appt.id);
        });
        return { ok: true, data: appt };
    }

    // Cancels an appointment
    function cancelAppointment(id) {
        if (!Cohere.Permissions.can("manageMeetings")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMeetings") };
        const appt = getAppointment(id);
        if (!appt) return { ok: false, error: "Event not found." };
        if (!Cohere.Permissions.canManageMeeting(appt)) return { ok: false, error: OTHER_ORG };
        if (appt.status === "Cancelled") return { ok: false, error: "Event is already cancelled." };
        appt.status = "Cancelled";
        Cohere.Storage.saveAll();
        Cohere.Activity.log("appointment", "Cancelled event \"" + appt.title + "\"");
        appt.memberIds.forEach(function (memberId) {
            Cohere.Notify.add("meeting", "Event \"" + appt.title + "\" on " + Cohere.Utils.formatDate(appt.date) + " has been cancelled.", memberId, appt.id);
        });
        return { ok: true, data: appt };
    }

    // Deletes an appointment with cascade (deletes attendance records)
    function deleteAppointment(id) {
        if (!Cohere.Permissions.can("manageMeetings")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMeetings") };
        const appt = getAppointment(id);
        if (!appt) return { ok: false, error: "Event not found." };
        if (!Cohere.Permissions.canManageMeeting(appt)) return { ok: false, error: OTHER_ORG };
        const attendanceCount = window.Cohere.state.attendance.filter(function (a) { return a.appointmentId === id; }).length;
        window.Cohere.state.attendance = window.Cohere.state.attendance.filter(function (a) { return a.appointmentId !== id; });
        window.Cohere.state.appointments = window.Cohere.state.appointments.filter(function (a) { return a.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("appointment", "Deleted event \"" + appt.title + "\"" + (attendanceCount > 0 ? " and " + attendanceCount + " attendance record(s)" : ""));
        return { ok: true, data: appt };
    }

    // ---- Attendance (M4) ----
    // Returns all attendance records for a meeting.
    function getAttendance(apptId) {
        return (window.Cohere.state.attendance || []).filter(function (r) {
            return r.appointmentId === apptId;
        });
    }

    // Returns the attendance record for one (meeting, member), or null.
    function getAttendanceRecord(apptId, memberId) {
        return (window.Cohere.state.attendance || []).find(function (r) {
            return r.appointmentId === apptId && r.memberId === memberId;
        }) || null;
    }

    // Creates or updates the attendance record for one (meeting, member).
    function setAttendance(apptId, memberId, status) {
        if (!Cohere.Permissions.can("markAttendance")) {
            return { ok: false, error: Cohere.Permissions.denyMessage("markAttendance") };
        }
        const appt = getAppointment(apptId);
        if (!appt) return { ok: false, error: "Meeting not found." };
        if (!Cohere.Permissions.canMarkAttendance(appt)) return { ok: false, error: OTHER_ORG };
        const member = getMember(memberId);
        if (!member) return { ok: false, error: "Member not found." };
        if (Cohere.Config.ATT_STATUSES.indexOf(status) === -1) {
            return { ok: false, error: "Invalid attendance status." };
        }

        const existing = getAttendanceRecord(apptId, memberId);
        const now = new Date().toISOString();
        if (existing) {
            existing.status = status;
            existing.markedAt = now;
        } else {
            window.Cohere.state.attendance.push({
                id: Cohere.Utils.generateId("att"),
                appointmentId: apptId,
                memberId: memberId,
                status: status,
                markedAt: now
            });
        }

        Cohere.Storage.saveAll();
        Cohere.Activity.log("attendance", "Marked " + member.fullName + " " + status + " for \"" + appt.title + "\"");
        return { ok: true };
    }

    // Marks every invited member of a meeting as present, overriding any existing status.
    function markAllPresent(apptId) {
        if (!Cohere.Permissions.can("markAttendance")) {
            return { ok: false, error: Cohere.Permissions.denyMessage("markAttendance") };
        }
        const appt = getAppointment(apptId);
        if (!appt) return { ok: false, error: "Meeting not found." };
        if (!Cohere.Permissions.canMarkAttendance(appt)) return { ok: false, error: OTHER_ORG };

        const now = new Date().toISOString();
        let added = 0;
        (appt.memberIds || []).forEach(function (memberId) {
            if (!getMember(memberId)) return;
            const existing = getAttendanceRecord(apptId, memberId);
            if (existing) {
                existing.status = "present";
                existing.markedAt = now;
            } else {
                window.Cohere.state.attendance.push({
                    id: Cohere.Utils.generateId("att"),
                    appointmentId: apptId,
                    memberId: memberId,
                    status: "present",
                    markedAt: now
                });
            }
            added++;
        });

        Cohere.Storage.saveAll();
        Cohere.Activity.log("attendance", "Marked all present for \"" + appt.title + "\" (" + added + " officer(s))");
        return { ok: true, added: added };
    }

    // Deletes all attendance records for a meeting.
    function clearAttendance(apptId) {
        if (!Cohere.Permissions.can("markAttendance")) {
            return { ok: false, error: Cohere.Permissions.denyMessage("markAttendance") };
        }
        const appt = getAppointment(apptId);
        if (!appt) return { ok: false, error: "Meeting not found." };
        if (!Cohere.Permissions.canMarkAttendance(appt)) return { ok: false, error: OTHER_ORG };

        const before = (window.Cohere.state.attendance || []).length;
        window.Cohere.state.attendance = (window.Cohere.state.attendance || []).filter(function (r) {
            return r.appointmentId !== apptId;
        });
        const removed = before - window.Cohere.state.attendance.length;

        Cohere.Storage.saveAll();
        Cohere.Activity.log("attendance", "Cleared attendance for \"" + appt.title + "\" (" + removed + " record(s))");
        return { ok: true, removed: removed };
    }

    return {
        getOrg, getMember, getMemberName, getTask, getAppointment, taskOrgId, apptOrgId, visibleTasks,
        addOrg, updateOrg, setOrgPicture, deleteOrg, getPresident, assignPresident,
        addMember, updateMember, deleteMember, setMemberStatus,
        addTask, updateTask, deleteTask, setTaskStatus,
        addAppointment, updateAppointment, cancelAppointment, deleteAppointment,
        getAttendance,
        getAttendanceRecord,
        setAttendance,
        markAllPresent,
        clearAttendance,
    };
})();