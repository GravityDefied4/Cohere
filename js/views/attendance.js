window.Cohere = window.Cohere || {};
Cohere.Attendance = (function () {
    "use strict";

    // Currently selected meeting id (module state, not persisted)
    let selectedAppointmentId = null;

    // Initializes the attendance view (attach listeners once)
    function init() {
        const select = document.getElementById("attendance-select");
        if (select) {
            select.addEventListener("change", function () {
                selectedAppointmentId = select.value || null;
                updateActionButtons();
                renderAttendanceTable();
                renderSummary();
            });
        }

        const markAllBtn = document.getElementById("btn-mark-all-present");
        if (markAllBtn) {
            markAllBtn.addEventListener("click", handleMarkAllPresent);
        }

        const clearBtn = document.getElementById("btn-clear-attendance");
        if (clearBtn) {
            clearBtn.addEventListener("click", handleClearAttendance);
        }

        // Delegated status buttons inside the attendance table
        const tbody = document.getElementById("attendance-table-body");
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-action='set-status']");
                if (!btn) return;
                const memberId = btn.dataset.memberId;
                const status = btn.dataset.status;
                if (!memberId || !status) return;
                handleSetStatus(memberId, status);
            });
        }
    }

    // Renders the entire attendance view
    function render() {
        renderMeetingSelector();
        updateActionButtons();
        renderAttendanceTable();
        renderSummary();
        renderRates();
    }

    // Returns true if the meeting is in the future (by date or today-but-ended)
    // Rule (c): date > today OR (date === today AND endTime < now)
    function isFutureMeeting(appt) {
        if (!appt) return false;
        const today = Cohere.Utils.todayISO();
        if (appt.date > today) return true;
        if (appt.date < today) return false;

        // Same day: compare end time to now
        if (!appt.endTime) return false;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const parts = appt.endTime.split(":");
        const endMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        return endMinutes < nowMinutes;
    }

    // Renders the meeting <select>. Future and cancelled meetings are shown
    // but disabled so the user knows they exist yet can't be marked.
    function renderMeetingSelector() {
        const select = document.getElementById("attendance-select");
        if (!select) return;

        const appointments = (window.Cohere.state.appointments || []).slice();

        // Sort by date descending (most recent first) so the latest is easy to pick
        appointments.sort(function (a, b) {
            if (a.date === b.date) return (b.startTime || "").localeCompare(a.startTime || "");
            return (b.date || "").localeCompare(a.date || "");
        });

        // Clear the select and add the placeholder
        Cohere.Utils.clearEl(select);
        select.appendChild(Cohere.Utils.createEl("option", {
            value: "",
            textContent: "Select a meeting"
        }));

        let firstSelectable = null;

        appointments.forEach(function (a) {
            const future = isFutureMeeting(a);
            const cancelled = a.status === "Cancelled";
            const selectable = !future && !cancelled;

            // Label with status tags so the reason for disabled is obvious
            let label = Cohere.Utils.formatDate(a.date) + " — " + a.title;
            if (cancelled) label += " [Cancelled]";
            else if (future) label += " [Upcoming]";
            else if (a.status === "Completed") label += " [Completed]";

            const opt = Cohere.Utils.createEl("option", {
                value: a.id,
                textContent: label
            });

            if (!selectable) {
                opt.disabled = true;
            } else if (!firstSelectable) {
                firstSelectable = a.id;
            }

            select.appendChild(opt);
        });

        // Preserve selection if still valid & selectable, else auto-pick first selectable
        const stillValid = selectedAppointmentId &&
            select.querySelector('option[value="' + selectedAppointmentId + '"]:not([disabled])');

        if (stillValid) {
            select.value = selectedAppointmentId;
        } else if (firstSelectable) {
            selectedAppointmentId = firstSelectable;
            select.value = firstSelectable;
        } else {
            selectedAppointmentId = null;
        }

        // If nothing selectable, show a hint in the table area
        if (!firstSelectable) {
            const tbody = document.getElementById("attendance-table-body");
            if (tbody) {
                Cohere.Utils.clearEl(tbody);
                const tr = Cohere.Utils.createEl("tr");
                tr.appendChild(Cohere.Utils.createEl("td", {
                    textContent: "No meetings available to mark yet. Future and cancelled meetings are shown in the dropdown but cannot be selected.",
                    colSpan: "2",
                    className: "text-muted"
                }));
                tbody.appendChild(tr);
            }
        }

        // Disable the action buttons when no meeting is selected
        updateActionButtons();
    }

    // Enables/disables the Mark All / Clear buttons, and shows a hint
    // explaining why they're disabled. No inline styling, no CSS edits.
    function updateActionButtons() {
        const disabled = !selectedAppointmentId;
        const markAllBtn = document.getElementById("btn-mark-all-present");
        const clearBtn = document.getElementById("btn-clear-attendance");
        const hint = document.getElementById("attendance-actions-hint");

        if (markAllBtn) markAllBtn.disabled = disabled;
        if (clearBtn) clearBtn.disabled = disabled;

        if (hint) {
            hint.hidden = !disabled;
            if (disabled) {
                hint.textContent = "Select a past or ongoing meeting to mark attendance.";
            }
        }
    }

    // Returns the currently selected appointment object (or null)
    function getSelectedAppointment() {
        if (!selectedAppointmentId) return null;
        return Cohere.Store.getAppointment(selectedAppointmentId);
    }

    // Builds a lookup of memberId -> attendance status for the selected meeting
    function getAttendanceMap(apptId) {
        const records = Cohere.Store.getAttendance(apptId) || [];
        const map = {};
        records.forEach(function (r) {
            map[r.memberId] = r.status;
        });
        return map;
    }

    // Renders the attendance table (one row per invited member)
    function renderAttendanceTable() {
        const tbody = document.getElementById("attendance-table-body");
        if (!tbody) return;

        Cohere.Utils.clearEl(tbody);

        const appt = getSelectedAppointment();
        if (!appt) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "Select a meeting to mark attendance.",
                colSpan: "2",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        const memberIds = appt.memberIds || [];
        if (memberIds.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "This meeting has no invited officers.",
                colSpan: "2",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        const statusMap = getAttendanceMap(appt.id);

        memberIds.forEach(function (memberId) {
            const member = Cohere.Store.getMember(memberId);
            if (!member) return; // member may have been deleted

            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: member.fullName }));

            const statusTd = Cohere.Utils.createEl("td");
            const current = statusMap[memberId] || null;

            if (Cohere.Permissions.can("markAttendance")) {
                // Show buttons for users with permission
                ["present", "absent", "excused"].forEach(function (status) {
                    const isActive = current === status;
                    const btn = Cohere.Utils.createEl("button", {
                        textContent: status.charAt(0).toUpperCase() + status.slice(1),
                        className: "btn " + (isActive ? "" : "btn-secondary"),
                        dataset: { action: "set-status", memberId: memberId, status: status },
                        style: "margin-right: 4px;"
                    });
                    statusTd.appendChild(btn);
                });
            } else {
                // Show read-only badge for users without permission
                if (current) {
                    const kind = current === "present" ? "present" : current === "absent" ? "absent" : "excused";
                    statusTd.appendChild(Cohere.UI.statusBadge(current.charAt(0).toUpperCase() + current.slice(1), kind));
                } else {
                    statusTd.appendChild(Cohere.UI.statusBadge("Unmarked", "pending"));
                }
            }

            tr.appendChild(statusTd);
            tbody.appendChild(tr);
        });
    }

    // Renders the summary line (counts of present/absent/excused)
    function renderSummary() {
        const box = document.getElementById("attendance-summary");
        if (!box) return;

        Cohere.Utils.clearEl(box);

        const appt = getSelectedAppointment();
        if (!appt) {
            box.textContent = "";
            return;
        }

        const records = Cohere.Store.getAttendance(appt.id) || [];
        const counts = { present: 0, absent: 0, excused: 0, unmarked: 0 };
        const marked = {};
        records.forEach(function (r) {
            marked[r.memberId] = true;
            if (counts[r.status] !== undefined) counts[r.status]++;
        });

        const invited = (appt.memberIds || []).filter(function (id) {
            return Cohere.Store.getMember(id) !== null;
        });
        counts.unmarked = invited.length - Object.keys(marked).length;

        box.appendChild(Cohere.Utils.createEl("div", {
            textContent:
                "Invited: " + invited.length +
                " · Present: " + counts.present +
                " · Absent: " + counts.absent +
                " · Excused: " + counts.excused +
                " · Unmarked: " + counts.unmarked
        }));
    }

    // Renders attendance rates per officer (aggregated across all past meetings)
    function renderRates() {
        const box = document.getElementById("attendance-rates");
        if (!box) return;

        Cohere.Utils.clearEl(box);

        const allRecords = (window.Cohere.state.attendance || []);
        if (allRecords.length === 0) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "No attendance recorded yet.",
                className: "text-muted"
            }));
            return;
        }

        // Group by member
        const byMember = {};
        allRecords.forEach(function (r) {
            if (!byMember[r.memberId]) byMember[r.memberId] = { present: 0, total: 0 };
            byMember[r.memberId].total++;
            if (r.status === "present") byMember[r.memberId].present++;
        });

        const heading = Cohere.Utils.createEl("h3", { textContent: "Attendance rates" });
        box.appendChild(heading);

        const table = Cohere.Utils.createEl("table");
        const thead = Cohere.Utils.createEl("thead");
        const headRow = Cohere.Utils.createEl("tr");
        headRow.appendChild(Cohere.Utils.createEl("th", { textContent: "Officer" }));
        headRow.appendChild(Cohere.Utils.createEl("th", { textContent: "Present / Total" }));
        headRow.appendChild(Cohere.Utils.createEl("th", { textContent: "Rate" }));
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = Cohere.Utils.createEl("tbody");
        Object.keys(byMember).forEach(function (memberId) {
            const member = Cohere.Store.getMember(memberId);
            if (!member) return;
            const stats = byMember[memberId];
            const rate = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;

            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: member.fullName }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: stats.present + " / " + stats.total }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(rate) }));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        const wrap = Cohere.Utils.createEl("div", { className: "table-wrap" });
        wrap.appendChild(table);
        box.appendChild(wrap);
    }

    // Sets a single officer's status for the selected meeting
    function handleSetStatus(memberId, status) {
        const appt = getSelectedAppointment();
        if (!appt) return;

        const result = Cohere.Store.setAttendance(appt.id, memberId, status);
        if (result.ok) {
            Cohere.UI.showToast("Attendance marked.", "success");
            renderAttendanceTable();
            renderSummary();
            renderRates();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Marks all invited officers present for the selected meeting
    function handleMarkAllPresent() {
        const appt = getSelectedAppointment();
        if (!appt) {
            Cohere.UI.showToast("Select a meeting first.", "error");
            return;
        }
        if (!Cohere.Permissions.can("markAttendance")) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("markAttendance"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("Mark all invited officers present?")) return;

        const result = Cohere.Store.markAllPresent(appt.id);
        if (result.ok) {
            Cohere.UI.showToast("All officers marked present.", "success");
            renderAttendanceTable();
            renderSummary();
            renderRates();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Clears all attendance for the selected meeting
    function handleClearAttendance() {
        const appt = getSelectedAppointment();
        if (!appt) {
            Cohere.UI.showToast("Select a meeting first.", "error");
            return;
        }
        if (!Cohere.Permissions.can("markAttendance")) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("markAttendance"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("Clear all attendance for this meeting?")) return;

        const result = Cohere.Store.clearAttendance(appt.id);
        if (result.ok) {
            Cohere.UI.showToast("Attendance cleared.", "success");
            renderAttendanceTable();
            renderSummary();
            renderRates();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    return { init, render };
})();