window.Cohere = window.Cohere || {};
Cohere.Store = (function () {
    "use strict";

    function getOrg(id) { return window.Cohere.state.organizations.find(function (o) { return o.id === id; }) || null; }
    function getMember(id) { return window.Cohere.state.members.find(function (m) { return m.id === id; }) || null; }
    function getMemberName(id) { const m = getMember(id); return m ? m.fullName : "Unknown officer"; }
    function getTask(id) { return window.Cohere.state.tasks.find(function (t) { return t.id === id; }) || null; }
    function getAppointment(id) { return window.Cohere.state.appointments.find(function (a) { return a.id === id; }) || null; }

    function addOrg(values) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const org = { id: Cohere.Utils.generateId("org"), name: values.name.trim(), description: (values.description || "").trim(), createdAt: Cohere.Utils.todayISO() };
        window.Cohere.state.organizations.push(org);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Created organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    function updateOrg(id, values) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const org = getOrg(id);
        if (!org) return { ok: false, error: "Organization not found." };
        org.name = values.name.trim();
        org.description = (values.description || "").trim();
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Updated organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    function deleteOrg(id) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const org = getOrg(id);
        if (!org) return { ok: false, error: "Organization not found." };
        if (window.Cohere.state.members.some(function (m) { return m.orgId === id; })) {
            return { ok: false, error: "Cannot delete organization \"" + org.name + "\" because it still has members. Remove or reassign them first." };
        }
        window.Cohere.state.organizations = window.Cohere.state.organizations.filter(function (o) { return o.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("organization", "Deleted organization \"" + org.name + "\"");
        return { ok: true, data: org };
    }

    function addMember(values) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const member = { id: Cohere.Utils.generateId("mem"), fullName: values.fullName.trim(), studentId: values.studentId.trim(), orgId: values.orgId, position: values.position, yearSection: (values.yearSection || "").trim(), email: (values.email || "").trim(), createdAt: Cohere.Utils.todayISO() };
        window.Cohere.state.members.push(member);
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Added member \"" + member.fullName + "\"");
        return { ok: true, data: member };
    }

    function updateMember(id, values) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const member = getMember(id);
        if (!member) return { ok: false, error: "Member not found." };
        member.fullName = values.fullName.trim();
        member.studentId = values.studentId.trim();
        member.orgId = values.orgId;
        member.position = values.position;
        member.yearSection = (values.yearSection || "").trim();
        member.email = (values.email || "").trim();
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Updated member \"" + member.fullName + "\"");
        return { ok: true, data: member };
    }

    function deleteMember(id) {
        if (!Cohere.Permissions.can("manageMembers")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMembers") };
        const member = getMember(id);
        if (!member) return { ok: false, error: "Member not found." };
        const memberTasks = window.Cohere.state.tasks.filter(function (t) { return t.assigneeId === id; });
        window.Cohere.state.tasks = window.Cohere.state.tasks.filter(function (t) { return t.assigneeId !== id; });
        window.Cohere.state.appointments.forEach(function (appt) { appt.memberIds = appt.memberIds.filter(function (mid) { return mid !== id; }); });
        window.Cohere.state.attendance = window.Cohere.state.attendance.filter(function (a) { return a.memberId !== id; });
        window.Cohere.state.members = window.Cohere.state.members.filter(function (m) { return m.id !== id; });
        if (Cohere.Permissions.getViewingAs() === id) Cohere.Permissions.setViewingAs("admin");
        Cohere.Storage.saveAll();
        Cohere.Activity.log("member", "Deleted member \"" + member.fullName + "\"" + (memberTasks.length > 0 ? " and " + memberTasks.length + " task(s)" : ""));
        return { ok: true, data: member };
    }

    function addTask(values) {
        if (!Cohere.Permissions.can("manageTasks")) return { ok: false, error: Cohere.Permissions.denyMessage("manageTasks") };
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
        window.Cohere.state.tasks = window.Cohere.state.tasks.filter(function (t) { return t.id !== id; });
        Cohere.Storage.saveAll();
        Cohere.Activity.log("task", "Deleted task \"" + task.title + "\"");
        return { ok: true, data: task };
    }

    // Adds a new appointment
    function addAppointment(values) {
        if (!Cohere.Permissions.can("manageMeetings")) return { ok: false, error: Cohere.Permissions.denyMessage("manageMeetings") };
        const appt = {
            id: Cohere.Utils.generateId("appt"),
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

    // Marks every invited member of a meeting as present (only fills unmarked ones).
    function markAllPresent(apptId) {
        if (!Cohere.Permissions.can("markAttendance")) {
            return { ok: false, error: Cohere.Permissions.denyMessage("markAttendance") };
        }
        const appt = getAppointment(apptId);
        if (!appt) return { ok: false, error: "Meeting not found." };

        const now = new Date().toISOString();
        let added = 0;
        (appt.memberIds || []).forEach(function (memberId) {
            if (!getMember(memberId)) return;
            if (getAttendanceRecord(apptId, memberId)) return;
            window.Cohere.state.attendance.push({
                id: Cohere.Utils.generateId("att"),
                appointmentId: apptId,
                memberId: memberId,
                status: "present",
                markedAt: now
            });
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
        getOrg, getMember, getMemberName, getTask, getAppointment,
        addOrg, updateOrg, deleteOrg,
        addMember, updateMember, deleteMember,
        addTask, updateTask, deleteTask, setTaskStatus,
        addAppointment, updateAppointment, cancelAppointment, deleteAppointment,
        getAttendance,
        getAttendanceRecord,
        setAttendance,
        markAllPresent,
        clearAttendance,
    };
})();