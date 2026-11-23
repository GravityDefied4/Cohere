window.Cohere = window.Cohere || {};
Cohere.Attendance = (function () {
    "use strict";

    // Currently selected meeting id (module state, not persisted)
    let selectedAppointmentId = null;

    // Currently active student (the one shown in the "Student attendance" card)
    let activeMemberId = null;

    // Current masterlist search text (module state, not persisted)
    let searchQuery = "";

    // Status and row flash shown briefly after marking.
    let justMarkedStatus = "";   // present | absent | excused: colors the flash on the marked student's ROW
    let justMarkedMemberId = ""; // the student who was just marked (not the one now on the card)
    let animateNextCard = false;
    let justMarkedTimer = null;
    let statusAnimationTimer = null;
    let statusAnimating = false;
    const masterlistPageSize = 5;
    let masterlistPage = 1;

    function clearJustMarked() {
        justMarkedStatus = "";
        justMarkedMemberId = "";
        if (justMarkedTimer) { clearTimeout(justMarkedTimer); justMarkedTimer = null; }
        if (statusAnimationTimer) { clearTimeout(statusAnimationTimer); statusAnimationTimer = null; }
        statusAnimating = false;
    }

    // Initializes the attendance view (attach listeners once)
    function init() {
        const select = document.getElementById("attendance-select");
        if (select) {
            select.addEventListener("change", function () {
                selectedAppointmentId = select.value || null;
                masterlistPage = 1;
                clearJustMarked();
                updateActionButtons();
                renderAttendanceTable();
                renderActiveStudent();
                renderSummary();
            });
        }

        const search = document.getElementById("attendance-search");
        if (search) {
            search.addEventListener("input", function () {
                searchQuery = search.value;
                masterlistPage = 1;
                renderAttendanceTable();
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

        const menuToggle = document.querySelector(".att-menu-toggle");
        const menuOptions = document.querySelector(".att-menu-options");
        if (menuToggle && menuOptions) {
            menuToggle.addEventListener("click", function (e) {
                e.stopPropagation();
                const open = menuOptions.hidden;
                menuOptions.hidden = !open;
                menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
            });
            menuOptions.addEventListener("click", function () {
                menuOptions.hidden = true;
                menuToggle.setAttribute("aria-expanded", "false");
            });
            document.addEventListener("click", function (e) {
                if (!e.target.closest(".att-menu")) {
                    menuOptions.hidden = true;
                    menuToggle.setAttribute("aria-expanded", "false");
                }
            });
            document.addEventListener("keydown", function (e) {
                if (e.key === "Escape") {
                    menuOptions.hidden = true;
                    menuToggle.setAttribute("aria-expanded", "false");
                    menuToggle.focus();
                }
            });
        }

        // Clicking (or pressing Enter/Space on) a masterlist row makes that student active
        const tbody = document.getElementById("attendance-table-body");
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const row = e.target.closest("tr[data-member-id]");
                if (row) setActiveMember(row.dataset.memberId);
            });
            tbody.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                const row = e.target.closest("tr[data-member-id]");
                if (!row) return;
                e.preventDefault();
                setActiveMember(row.dataset.memberId);
            });
        }

        // Delegated status buttons inside the active student card
        const studentBox = document.getElementById("attendance-student");
        if (studentBox) {
            studentBox.addEventListener("click", function (e) {
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
        renderActiveStudent();
        renderSummary();
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
        const selAppt = getSelectedAppointment();
        const canMark = !selAppt || Cohere.Permissions.canMarkAttendance(selAppt);
        const disabled = !selectedAppointmentId || !canMark;
        const markAllBtn = document.getElementById("btn-mark-all-present");
        const clearBtn = document.getElementById("btn-clear-attendance");
        const hint = document.getElementById("attendance-actions-hint");

        if (markAllBtn) markAllBtn.disabled = disabled;
        if (clearBtn) clearBtn.disabled = disabled;

        if (hint) {
            hint.hidden = !disabled;
            if (disabled) {
                hint.textContent = !selectedAppointmentId ? "Select a past or ongoing meeting to mark attendance." : "You can only mark attendance for your own organization.";
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

    // Returns the member objects invited to the selected meeting (deleted members skipped)
    function getInvitedMembers() {
        const appt = getSelectedAppointment();
        if (!appt) return [];
        return (appt.memberIds || []).map(function (id) {
            return Cohere.Store.getMember(id);
        }).filter(Boolean).sort(function (a, b) {
            // Masterlist is always alphabetical (A-Z) by full name
            return String(a.fullName || "").localeCompare(String(b.fullName || ""), undefined, { sensitivity: "base" });
        });
    }

    // Invited students that match the search box (name or student ID), still A-Z.
    // Open to everyone.
    function getVisibleMembers() {
        const q = searchQuery.trim().toLowerCase();
        let list = getInvitedMembers();

        if (q) {
            list = list.filter(function (m) {
                return String(m.fullName || "").toLowerCase().indexOf(q) !== -1 ||
                    String(m.studentId || "").toLowerCase().indexOf(q) !== -1;
            });
        }

        return list;
    }

    // Returns the student that follows memberId in the visible masterlist (or null if last)
    function getNextMember(memberId) {
        const invited = getVisibleMembers();
        const idx = invited.findIndex(function (m) { return m.id === memberId; });
        return idx >= 0 && idx < invited.length - 1 ? invited[idx + 1] : null;
    }

    // Keeps the active row visible in the masterlist while moving through students
    function scrollActiveRowIntoView() {
        const row = document.querySelector("#attendance-table-body tr.is-active");
        if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    }

    // Keeps activeMemberId valid: falls back to the first invited student
    function ensureActiveMember() {
        const invited = getInvitedMembers();
        const stillInvited = invited.some(function (m) { return m.id === activeMemberId; });
        if (!stillInvited) activeMemberId = invited.length ? invited[0].id : null;
    }

    // Makes a student the active one and refreshes the list highlight + card
    function setActiveMember(memberId) {
        if (!memberId || memberId === activeMemberId) return;
        clearJustMarked();
        activeMemberId = memberId;
        const visible = getVisibleMembers();
        const index = visible.findIndex(function (member) { return member.id === memberId; });
        if (index >= 0) masterlistPage = Math.floor(index / masterlistPageSize) + 1;
        renderAttendanceTable();
        renderActiveStudent();
        scrollActiveRowIntoView();
    }

    // "Present" -> "Present" label helper
    function statusLabel(status) {
        return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unmarked";
    }

    // Builds a status badge (or an "Unmarked" badge when there is no record)
    function buildStatusBadge(current) {
        if (!current) return Cohere.UI.statusBadge("Unmarked", "pending");
        const kind = current === "present" ? "present" : current === "absent" ? "absent" : "excused";
        return Cohere.UI.statusBadge(statusLabel(current), kind);
    }

    function renderMasterlistPagination(totalMembers) {
        const pagination = document.getElementById("attendance-pagination");
        if (!pagination) return;

        Cohere.Utils.clearEl(pagination);
        const totalPages = Math.ceil(totalMembers / masterlistPageSize);
        if (totalPages <= 1) {
            pagination.hidden = true;
            return;
        }

        pagination.hidden = false;
        for (let page = 1; page <= totalPages; page++) {
            const button = Cohere.Utils.createEl("button", {
                textContent: String(page),
                className: "att-page-btn" + (page === masterlistPage ? " is-active" : "")
            });
            button.type = "button";
            button.setAttribute("aria-label", "Go to officer page " + page);
            button.setAttribute("aria-current", page === masterlistPage ? "page" : "false");
            button.addEventListener("click", function () {
                masterlistPage = page;
                renderAttendanceTable();
            });
            pagination.appendChild(button);
        }
    }

    // Renders the masterlist (one row per invited member). Rows are clickable.
    function renderAttendanceTable() {
        const tbody = document.getElementById("attendance-table-body");
        if (!tbody) return;

        Cohere.Utils.clearEl(tbody);
        renderMasterlistPagination(0);

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

        ensureActiveMember();
        const statusMap = getAttendanceMap(appt.id);

        const visible = getVisibleMembers();
        if (visible.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: searchQuery.trim()
                    ? "No students match \u201C" + searchQuery.trim() + "\u201D."
                    : "No students match this filter.",
                colSpan: "2",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        const totalPages = Math.ceil(visible.length / masterlistPageSize);
        if (masterlistPage > totalPages) masterlistPage = totalPages;
        if (masterlistPage < 1) masterlistPage = 1;
        renderMasterlistPagination(visible.length);
        const start = (masterlistPage - 1) * masterlistPageSize;
        const pageMembers = visible.slice(start, start + masterlistPageSize);

        pageMembers.forEach(function (member) {
            const isActive = member.id === activeMemberId;
            const flash = member.id === justMarkedMemberId && justMarkedStatus;
            const tr = Cohere.Utils.createEl("tr", {
                className: (isActive ? "is-active" : "") + (flash ? " att-row-flash att-fx-" + justMarkedStatus : ""),
                dataset: { memberId: member.id }
            });
            tr.tabIndex = 0;
            tr.setAttribute("aria-selected", isActive ? "true" : "false");

            tr.appendChild(Cohere.Utils.createEl("td", { textContent: member.fullName }));

            const statusTd = Cohere.Utils.createEl("td");
            statusTd.appendChild(buildStatusBadge(statusMap[member.id] || null));
            tr.appendChild(statusTd);
            tbody.appendChild(tr);
        });
    }

    // Builds the initials shown in the avatar circle
    function getInitials(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "?";
        const first = parts[0].charAt(0);
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
        return (first + last).toUpperCase();
    }

    // Renders the "Student attendance" card for the active student
    function renderActiveStudent() {
        const box = document.getElementById("attendance-student");
        if (!box) return;

        Cohere.Utils.clearEl(box);

        const appt = getSelectedAppointment();
        ensureActiveMember();
        const member = appt && activeMemberId ? Cohere.Store.getMember(activeMemberId) : null;

        if (!member) {
            const empty = Cohere.Utils.createEl("div", { className: "att-card att-empty" });
            empty.appendChild(Cohere.Utils.createEl("p", {
                className: "text-muted",
                textContent: appt
                    ? "No invited officers to show for this meeting."
                    : "Select a meeting, then choose a student from the masterlist."
            }));
            box.appendChild(empty);
            return;
        }

        const current = getAttendanceMap(appt.id)[member.id] || null;
        const org = Cohere.Store.getOrg(member.orgId);

        // Card: avatar + name + details + current status
        const card = Cohere.Utils.createEl("div", { className: "att-card" + (animateNextCard ? " att-enter" : "") });
        animateNextCard = false;
        card.appendChild(Cohere.Utils.createEl("span", {
            className: "att-avatar",
            textContent: getInitials(member.fullName)
        }));

        const info = Cohere.Utils.createEl("div", { className: "att-info" });
        const head = Cohere.Utils.createEl("div", { className: "att-head" });
        head.appendChild(Cohere.Utils.createEl("h3", { className: "att-name", textContent: member.fullName }));
        head.appendChild(buildStatusBadge(current));
        info.appendChild(head);

        const details = [
            member.position + (org ? " · " + org.name : ""),
            "ID " + member.studentId
        ];
        details.forEach(function (line) {
            info.appendChild(Cohere.Utils.createEl("p", { className: "att-details", textContent: line }));
        });
        card.appendChild(info);
        box.appendChild(card);

        // Status choices (Present / Absent / Excused), only for users who may mark attendance
        if (Cohere.Permissions.canMarkAttendance(getSelectedAppointment())) {
            const choices = Cohere.Utils.createEl("div", { className: "att-choices" });
            ["present", "absent", "excused"].forEach(function (status) {
                const isActive = current === status;
                const btn = Cohere.Utils.createEl("button", {
                    textContent: statusLabel(status),
                    className: "btn att-choice" + (isActive ? "" : " btn-secondary"),
                    dataset: { action: "set-status", memberId: member.id, status: status }
                });
                btn.type = "button";
                btn.setAttribute("aria-pressed", isActive ? "true" : "false");
                choices.appendChild(btn);
            });
            box.appendChild(choices);
        }
    }

    // Renders the summary: one progress bar ("3 of 4 marked") + a quiet legend of counts
    function renderSummary() {
        const box = document.getElementById("attendance-summary");
        if (!box) return;

        Cohere.Utils.clearEl(box);

        const appt = getSelectedAppointment();
        if (!appt) return;

        const invited = getInvitedMembers();
        if (!invited.length) return;

        const statusMap = getAttendanceMap(appt.id);
        const counts = { present: 0, absent: 0, excused: 0 };
        let marked = 0;
        invited.forEach(function (m) {
            const st = statusMap[m.id];
            if (st && counts[st] !== undefined) { counts[st]++; marked++; }
        });

        const top = Cohere.Utils.createEl("div", { className: "att-progress-top" });
        top.appendChild(Cohere.Utils.createEl("strong", {
            textContent: marked + " of " + invited.length + " marked"
        }));
        box.appendChild(top);

        const bar = Cohere.Utils.createEl("div", { className: "att-bar" });
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", String(invited.length));
        bar.setAttribute("aria-valuenow", String(marked));
        const fill = Cohere.Utils.createEl("span");
        fill.style.width = Math.round((marked / invited.length) * 100) + "%";
        bar.appendChild(fill);
        box.appendChild(bar);

        const legend = Cohere.Utils.createEl("div", { className: "att-legend" });
        [["present", "Present"], ["absent", "Absent"], ["excused", "Excused"]].forEach(function (pair) {
            const item = Cohere.Utils.createEl("span", { className: "att-legend-item" });
            item.appendChild(Cohere.Utils.createEl("i", { className: "att-dot att-dot-" + pair[0] }));
            item.appendChild(document.createTextNode(counts[pair[0]] + " " + pair[1]));
            legend.appendChild(item);
        });
        box.appendChild(legend);
    }

    // Sets a single officer's status for the selected meeting
    function handleSetStatus(memberId, status) {
        const appt = getSelectedAppointment();
        if (!appt) return;
        if (statusAnimating) return;

        const result = Cohere.Store.setAttendance(appt.id, memberId, status);
        if (result.ok) {
            // Move on to the next student in the alphabetical masterlist
            const next = getNextMember(memberId);
            justMarkedStatus = status;
            justMarkedMemberId = memberId;

            const card = document.querySelector("#attendance-student .att-card");
            if (card) {
                statusAnimating = true;
                card.classList.remove("att-status-present", "att-status-absent", "att-status-excused");
                card.classList.add("att-status-" + status);
                if (next) card.classList.add("att-card-shuffle-out");
            }

            renderAttendanceTable();
            renderSummary();
            scrollActiveRowIntoView();

            if (statusAnimationTimer) clearTimeout(statusAnimationTimer);
            statusAnimationTimer = setTimeout(function () {
                if (next) {
                    activeMemberId = next.id;
                    const nextVisible = getVisibleMembers();
                    const nextIndex = nextVisible.findIndex(function (member) { return member.id === next.id; });
                    if (nextIndex >= 0) masterlistPage = Math.floor(nextIndex / masterlistPageSize) + 1;
                    animateNextCard = true;
                    renderAttendanceTable();
                    renderActiveStudent();
                    scrollActiveRowIntoView();
                } else {
                    const currentCard = document.querySelector("#attendance-student .att-card");
                    if (currentCard) currentCard.classList.remove("att-status-" + status);
                }
                statusAnimating = false;
                statusAnimationTimer = null;
            }, next ? 520 : 900);

            if (!next) {
                Cohere.UI.showToast("Attendance marked for the last student in the list.", "success");
            }

            // Clear the brief row highlight after a moment.
            if (justMarkedTimer) clearTimeout(justMarkedTimer);
            justMarkedTimer = setTimeout(function () {
                justMarkedStatus = "";
                justMarkedMemberId = "";
                justMarkedTimer = null;
                const flashRow = document.querySelector("#attendance-table-body tr.att-row-flash");
                if (flashRow) flashRow.classList.remove("att-row-flash");
            }, 2500);
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
        if (!Cohere.Permissions.canMarkAttendance(appt)) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("markAttendance"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("Mark all invited officers present?")) return;

        const result = Cohere.Store.markAllPresent(appt.id);
        if (result.ok) {
            Cohere.UI.showToast("All officers marked present.", "success");
            renderAttendanceTable();
            renderActiveStudent();
            renderSummary();
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
        if (!Cohere.Permissions.canMarkAttendance(appt)) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("markAttendance"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("Clear all attendance for this meeting?")) return;

        const result = Cohere.Store.clearAttendance(appt.id);
        if (result.ok) {
            Cohere.UI.showToast("Attendance cleared.", "success");
            renderAttendanceTable();
            renderActiveStudent();
            renderSummary();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    return { init, render };
})();