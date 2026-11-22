window.Cohere = window.Cohere || {};
Cohere.Appointments = (function () {
    "use strict";

    // Initializes the appointments view (attach listeners once)
    function init() {
        const apptForm = document.getElementById("appt-form");
        if (apptForm) apptForm.addEventListener("submit", handleApptSubmit);

        const apptCancel = document.getElementById("appt-cancel");
        if (apptCancel) apptCancel.addEventListener("click", resetApptForm);

        // Live conflict preview on date/time/officer changes (E22)
        ["appt-date", "appt-start", "appt-end"].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", previewConflicts);
        });

        const apptMembers = document.getElementById("appt-members");
        if (apptMembers) {
            apptMembers.addEventListener("change", function (e) {
                if (e.target.matches("input[type='checkbox']")) previewConflicts();
            });
        }

        // List delegation (E23, E24)
        const apptList = document.getElementById("appt-list");
        if (apptList) {
            apptList.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-action]");
                if (!btn) return;
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (action === "edit") startEditAppt(id);
                else if (action === "cancel-meeting") handleCancelMeeting(id);
                else if (action === "delete") handleDeleteAppt(id);
                else if (action === "attendance") openAttendance(id);
            });
        }

        // Toolbar filters
        const apptSearch = document.getElementById("appt-search");
        if (apptSearch) apptSearch.addEventListener("input", renderApptList);

        const filterStatus = document.getElementById("appt-filter-status");
        if (filterStatus) filterStatus.addEventListener("change", renderApptList);
    }

    // Renders the entire appointments view
    function render() {
        renderApptForm();
        renderApptList();
        previewConflicts();
    }

    // Renders the appointment form (member checkboxes grouped by org)
    function renderApptForm() {
        const membersContainer = document.getElementById("appt-members");
        if (!membersContainer) return;
        Cohere.Utils.clearEl(membersContainer);

        const members = window.Cohere.state.members;
        if (members.length === 0) {
            membersContainer.appendChild(Cohere.Utils.createEl("p", { textContent: "No officers available. Add members first.", className: "text-muted" }));
            return;
        }

        const grouped = {};
        members.forEach(function (m) {
            if (!grouped[m.orgId]) grouped[m.orgId] = [];
            grouped[m.orgId].push(m);
        });

        const editingId = document.getElementById("appt-id").value;
        let editingMemberIds = [];
        if (editingId) {
            const appt = Cohere.Store.getAppointment(editingId);
            if (appt) editingMemberIds = appt.memberIds;
        }

        Object.keys(grouped).forEach(function (orgId) {
            const org = Cohere.Store.getOrg(orgId);
            const orgName = org ? org.name : "Unknown Organization";
            const groupDiv = Cohere.Utils.createEl("div", { className: "org-group" });
            groupDiv.appendChild(Cohere.Utils.createEl("h4", { textContent: orgName, style: "margin: 8px 0 4px 0; font-size: 0.9rem; color: var(--color-muted);" }));

            grouped[orgId].forEach(function (m) {
                const label = Cohere.Utils.createEl("label", { style: "display: block; padding: 4px 0; cursor: pointer;" });
                const checkbox = Cohere.Utils.createEl("input", { type: "checkbox", value: m.id, style: "margin-right: 8px;" });
                if (editingMemberIds.includes(m.id)) checkbox.checked = true;
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(m.fullName + " — " + m.position));
                groupDiv.appendChild(label);
            });
            membersContainer.appendChild(groupDiv);
        });

        const filterStatus = document.getElementById("appt-filter-status");
        if (filterStatus && !filterStatus.options.length) {
            Cohere.Utils.populateSelect(filterStatus, [
                { value: "", label: "All statuses" },
                { value: "Scheduled", label: "Scheduled" },
                { value: "Completed", label: "Completed" },
                { value: "Cancelled", label: "Cancelled" }
            ], null);
        }

        if (editingId) {
            const appt = Cohere.Store.getAppointment(editingId);
            if (appt) {
                document.getElementById("appt-title").value = appt.title;
                document.getElementById("appt-date").value = appt.date;
                document.getElementById("appt-start").value = appt.startTime;
                document.getElementById("appt-end").value = appt.endTime;
                document.getElementById("appt-location").value = appt.location;
                document.getElementById("appt-notes").value = appt.notes || "";
                document.getElementById("appt-submit").textContent = "Update Meeting";
                document.getElementById("appt-cancel").hidden = false;
            }
        }
    }

    // Gets the selected member IDs from the checkboxes
    function getSelectedMemberIds() {
        const checkboxes = document.querySelectorAll("#appt-members input[type='checkbox']:checked");
        return Array.from(checkboxes).map(function (cb) { return cb.value; });
    }

    // Previews conflicts live as the user changes date/time/officers (E22)
    function previewConflicts() {
        const conflictBox = document.getElementById("appt-conflict-box");
        if (!conflictBox) return;

        const date = document.getElementById("appt-date").value;
        const startTime = document.getElementById("appt-start").value;
        const endTime = document.getElementById("appt-end").value;
        const memberIds = getSelectedMemberIds();

        if (!date || !startTime || !endTime || memberIds.length === 0) {
            conflictBox.hidden = true;
            Cohere.Utils.clearEl(conflictBox);
            return;
        }

        const editingId = document.getElementById("appt-id").value || null;
        const candidate = { date: date, startTime: startTime, endTime: endTime, memberIds: memberIds };
        const conflicts = Cohere.Services.findConflicts(candidate, editingId);

        Cohere.Utils.clearEl(conflictBox);
        if (conflicts.length === 0) {
            conflictBox.hidden = true;
            return;
        }

        conflictBox.hidden = false;
        conflictBox.appendChild(Cohere.Utils.createEl("strong", { textContent: "Scheduling conflict detected:" }));
        const list = Cohere.Utils.createEl("ul", { style: "margin: 8px 0 0 20px;" });

        conflicts.forEach(function (conflictAppt) {
            const overlappingOfficers = conflictAppt.memberIds.filter(function (id) { return memberIds.includes(id); });
            overlappingOfficers.forEach(function (officerId) {
                const officerName = Cohere.Store.getMemberName(officerId);
                const timeRange = Cohere.Utils.formatTime(conflictAppt.startTime) + "–" + Cohere.Utils.formatTime(conflictAppt.endTime);
                list.appendChild(Cohere.Utils.createEl("li", { textContent: "Conflict: " + officerName + " is already in '" + conflictAppt.title + "' (" + timeRange + ")." }));
            });
        });
        conflictBox.appendChild(list);
    }

    // Renders the appointment list with filters
    function renderApptList() {
        const listContainer = document.getElementById("appt-list");
        if (!listContainer) return;
        Cohere.Utils.clearEl(listContainer);

        const search = (document.getElementById("appt-search").value || "").toLowerCase();
        const statusFilter = document.getElementById("appt-filter-status").value;

        let appointments = window.Cohere.state.appointments.slice();
        if (statusFilter) appointments = appointments.filter(function (a) { return a.status === statusFilter; });
        if (search) {
            appointments = appointments.filter(function (a) {
                return a.title.toLowerCase().includes(search) || a.location.toLowerCase().includes(search);
            });
        }

        // Sort: upcoming first (date asc), then past (date desc), then cancelled
        appointments.sort(function (a, b) {
            const today = Cohere.Utils.todayISO();
            const aIsCancelled = a.status === "Cancelled";
            const bIsCancelled = b.status === "Cancelled";
            const aIsUpcoming = a.date >= today && !aIsCancelled;
            const bIsUpcoming = b.date >= today && !bIsCancelled;

            if (aIsUpcoming && !bIsUpcoming) return -1;
            if (!aIsUpcoming && bIsUpcoming) return 1;
            if (aIsCancelled && !bIsCancelled) return 1;
            if (!aIsCancelled && bIsCancelled) return -1;

            if (aIsUpcoming) {
                return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
            } else {
                return b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime);
            }
        });

        if (appointments.length === 0) {
            listContainer.appendChild(Cohere.Utils.createEl("p", { textContent: "No meetings found. Use the form to schedule one.", className: "text-muted" }));
            return;
        }

        appointments.forEach(function (appt) {
            const card = Cohere.Utils.createEl("div", { className: "card", style: "margin-bottom: 16px;" });
            const header = Cohere.Utils.createEl("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" });
            header.appendChild(Cohere.Utils.createEl("h3", { textContent: appt.title, style: "margin: 0; font-size: 1.1rem;" }));

            const statusKind = appt.status === "Completed" ? "completed" : appt.status === "Cancelled" ? "cancelled" : "pending";
            header.appendChild(Cohere.UI.statusBadge(appt.status, statusKind));
            card.appendChild(header);

            card.appendChild(Cohere.Utils.createEl("div", { textContent: Cohere.Utils.formatDate(appt.date) + " • " + Cohere.Utils.formatTime(appt.startTime) + "–" + Cohere.Utils.formatTime(appt.endTime), style: "font-weight: 500; margin-bottom: 4px;" }));
            card.appendChild(Cohere.Utils.createEl("div", { textContent: "📍 " + appt.location, style: "margin-bottom: 8px;" }));

            const invitees = Cohere.Utils.createEl("div", { style: "margin-bottom: 8px;" });
            invitees.appendChild(Cohere.Utils.createEl("strong", { textContent: "Invitees: ", style: "font-size: 0.875rem;" }));
            invitees.appendChild(document.createTextNode(appt.memberIds.map(function (id) { return Cohere.Store.getMemberName(id); }).join(", ")));
            card.appendChild(invitees);

            if (appt.notes) {
                card.appendChild(Cohere.Utils.createEl("div", { textContent: "Notes: " + appt.notes, className: "text-muted", style: "font-size: 0.875rem; margin-bottom: 8px;" }));
            }

            const actions = Cohere.Utils.createEl("div", { style: "display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;" });
            const canManage = Cohere.Permissions.can("manageMeetings");

            if (canManage) {
                actions.appendChild(Cohere.Utils.createEl("button", { textContent: "Edit", className: "btn btn-secondary", dataset: { action: "edit", id: appt.id } }));
                if (appt.status === "Scheduled") {
                    actions.appendChild(Cohere.Utils.createEl("button", { textContent: "Cancel Meeting", className: "btn btn-danger", dataset: { action: "cancel-meeting", id: appt.id } }));
                }
                actions.appendChild(Cohere.Utils.createEl("button", { textContent: "Delete", className: "btn btn-danger", dataset: { action: "delete", id: appt.id } }));
            }
            actions.appendChild(Cohere.Utils.createEl("button", { textContent: "Attendance", className: "btn", dataset: { action: "attendance", id: appt.id } }));

            card.appendChild(actions);
            listContainer.appendChild(card);
        });
    }

    // Handles appointment form submission (E21)
    function handleApptSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = document.getElementById("appt-id").value;

        const values = {
            title: document.getElementById("appt-title").value,
            date: document.getElementById("appt-date").value,
            startTime: document.getElementById("appt-start").value,
            endTime: document.getElementById("appt-end").value,
            location: document.getElementById("appt-location").value,
            notes: document.getElementById("appt-notes").value,
            memberIds: getSelectedMemberIds()
        };

        Cohere.UI.clearFieldErrors(form);
        const membersError = form.querySelector("#appt-members + .field-error");
        if (membersError) membersError.remove();

        const validation = Cohere.Validators.validateAppointment(values, editingId || null);
        if (!validation.valid) {
            Cohere.UI.showFieldErrors(form, validation.errors);
            if (validation.errors["appt-members"]) {
                const membersContainer = document.getElementById("appt-members");
                membersContainer.parentNode.insertBefore(Cohere.Utils.createEl("small", { className: "field-error", textContent: validation.errors["appt-members"] }), membersContainer.nextSibling);
            }
            return;
        }

        // Check for conflicts before saving
        const candidate = { date: values.date, startTime: values.startTime, endTime: values.endTime, memberIds: values.memberIds };
        if (Cohere.Services.findConflicts(candidate, editingId || null).length > 0) {
            previewConflicts();
            Cohere.UI.showToast("Cannot save: scheduling conflict detected.", "error");
            return;
        }

        const result = editingId ? Cohere.Store.updateAppointment(editingId, values) : Cohere.Store.addAppointment(values);
        if (result.ok) {
            Cohere.UI.showToast(editingId ? "Meeting updated." : "Meeting scheduled.", "success");
            resetApptForm();
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Starts editing an appointment
    function startEditAppt(id) {
        const appt = Cohere.Store.getAppointment(id);
        if (!appt) return;
        document.getElementById("appt-id").value = appt.id;
        document.getElementById("appt-title").value = appt.title;
        document.getElementById("appt-date").value = appt.date;
        document.getElementById("appt-start").value = appt.startTime;
        document.getElementById("appt-end").value = appt.endTime;
        document.getElementById("appt-location").value = appt.location;
        document.getElementById("appt-notes").value = appt.notes || "";
        document.getElementById("appt-submit").textContent = "Update Meeting";
        document.getElementById("appt-cancel").hidden = false;
        renderApptForm();
        previewConflicts();
        document.getElementById("appt-title").focus();
    }

    // Handles meeting cancellation (E23)
    function handleCancelMeeting(id) {
        const appt = Cohere.Store.getAppointment(id);
        if (!appt) return;
        if (!Cohere.UI.confirmAction("Cancel meeting \"" + appt.title + "\"?")) return;
        const result = Cohere.Store.cancelAppointment(id);
        if (result.ok) {
            Cohere.UI.showToast("Meeting cancelled.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Handles appointment deletion
    function handleDeleteAppt(id) {
        const appt = Cohere.Store.getAppointment(id);
        if (!appt) return;
        if (!Cohere.UI.confirmAction("Delete meeting \"" + appt.title + "\"? This will also delete all attendance records for this meeting.")) return;
        const result = Cohere.Store.deleteAppointment(id);
        if (result.ok) {
            Cohere.UI.showToast("Meeting deleted.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Opens the attendance view with the specified meeting selected (E24)
    function openAttendance(id) {
        window.Cohere.state._pendingAttendanceApptId = id;
        Cohere.App.showView("attendance");
    }

    // Resets the appointment form
    function resetApptForm() {
        const form = document.getElementById("appt-form");
        if (form) {
            form.reset();
            document.getElementById("appt-id").value = "";
            document.getElementById("appt-submit").textContent = "Schedule Meeting";
            document.getElementById("appt-cancel").hidden = true;
            Cohere.UI.clearFieldErrors(form);
            const membersError = form.querySelector("#appt-members + .field-error");
            if (membersError) membersError.remove();
            document.querySelectorAll("#appt-members input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
            const conflictBox = document.getElementById("appt-conflict-box");
            if (conflictBox) {
                conflictBox.hidden = true;
                Cohere.Utils.clearEl(conflictBox);
            }
        }
    }

    return { init, render, renderApptList, previewConflicts, openAttendance };
})();