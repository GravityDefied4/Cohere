window.Cohere = window.Cohere || {};
Cohere.Appointments = (function () {
    "use strict";

    // Active status filter for the list ("" = all)
    let statusFilter = "";

    // Calendar state: month being shown (first of month) and the day picked, if any
    let calMonth = null;
    let selectedDate = "";

    const STATUS_TABS = [
        { value: "", label: "All" },
        { value: "Scheduled", label: "Scheduled" },
        { value: "Completed", label: "Completed" },
        { value: "Cancelled", label: "Cancelled" }
    ];

    // List sections, in display order
    const GROUPS = [
        { key: "today", label: "Today" },
        { key: "upcoming", label: "Upcoming" },
        { key: "earlier", label: "Earlier" },
        { key: "cancelled", label: "Cancelled" }
    ];

    // ---- small view helpers ------------------------------------------------
    function icon(id) {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", "ic");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(ns, "use");
        use.setAttribute("href", "#" + id);
        svg.appendChild(use);
        return svg;
    }

    function dotsIcon() {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("class", "ic");
        svg.setAttribute("aria-hidden", "true");
        [5, 12, 19].forEach(function (cx) {
            const c = document.createElementNS(ns, "circle");
            c.setAttribute("cx", cx); c.setAttribute("cy", "12"); c.setAttribute("r", "1.6");
            c.setAttribute("fill", "currentColor"); c.setAttribute("stroke", "none");
            svg.appendChild(c);
        });
        return svg;
    }

    // Closes every open "more actions" menu
    function closeMenus(except) {
        document.querySelectorAll("#appt-list .sched-menu-list:not([hidden])").forEach(function (list) {
            if (list === except) return;
            list.hidden = true;
            const t = list.parentNode.querySelector("[data-menu-toggle]");
            if (t) t.setAttribute("aria-expanded", "false");
        });
    }

    function initials(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        const first = parts[0].charAt(0);
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
        return (first + last).toUpperCase();
    }

    function durationLabel(start, end) {
        if (!start || !end) return "";
        const s = start.split(":"), e = end.split(":");
        const mins = (parseInt(e[0], 10) * 60 + parseInt(e[1], 10)) - (parseInt(s[0], 10) * 60 + parseInt(s[1], 10));
        if (!(mins > 0)) return "";
        const h = Math.floor(mins / 60), m = mins % 60;
        return (h ? h + " hr" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
    }

    function dateParts(iso) {
        const p = iso.split("-");
        const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        return {
            month: d.toLocaleDateString("en-US", { month: "short" }),
            day: d.getDate(),
            weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
            year: d.getFullYear()
        };
    }

    function groupKeyFor(appt, today) {
        if (appt.status === "Cancelled") return "cancelled";
        if (appt.date === today) return "today";
        return appt.date > today ? "upcoming" : "earlier";
    }

    function pad2(n) { return n < 10 ? "0" + n : String(n); }
    function toISO(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
    function fromISO(iso) { const p = iso.split("-"); return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)); }

    function shortLink(url) {
        return String(url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
    }

    // Initializes the appointments view (attach listeners once)
    function init() {
        const apptForm = document.getElementById("appt-form");
        if (apptForm) apptForm.addEventListener("submit", handleApptSubmit);

        const apptCancel = document.getElementById("appt-cancel");
        if (apptCancel) apptCancel.addEventListener("click", resetApptForm);

        // Meeting type radio change (toggle location/link fields)
        const meetingTypeRadios = document.querySelectorAll('input[name="appt-meetingType"]');
        meetingTypeRadios.forEach(function (radio) {
            radio.addEventListener("change", toggleMeetingTypeFields);
        });

        // Live conflict preview on date/time/officer changes (E22)
        ["appt-date", "appt-start", "appt-end"].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", previewConflicts);
        });

        const apptMembers = document.getElementById("appt-members");
        if (apptMembers) {
            apptMembers.addEventListener("change", function (e) {
                if (e.target.matches("input[type='checkbox']")) { updateGroupToggles(); previewConflicts(); }
            });
        }

        // List delegation (E23, E24)
        const apptList = document.getElementById("appt-list");
        if (apptList) {
            apptList.addEventListener("click", function (e) {
                const toggle = e.target.closest("[data-menu-toggle]");
                if (toggle) {
                    const list = toggle.parentNode.querySelector(".sched-menu-list");
                    const opening = list.hidden;
                    closeMenus(opening ? list : null);
                    list.hidden = !opening;
                    toggle.setAttribute("aria-expanded", opening ? "true" : "false");
                    if (opening) { const first = list.querySelector("button"); if (first) first.focus(); }
                    return;
                }
                const btn = e.target.closest("[data-action]");
                if (!btn) return;
                closeMenus();
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (action === "edit") startEditAppt(id);
                else if (action === "cancel-meeting") handleCancelMeeting(id);
                else if (action === "delete") handleDeleteAppt(id);
                else if (action === "attendance") openAttendance(id);
                else if (action === "clear-date") { selectedDate = ""; renderApptList(); }
                else if (action === "new-on-date") scheduleOnDate(selectedDate);
            });
        }

        // Toolbar filters
        const apptSearch = document.getElementById("appt-search");
        if (apptSearch) apptSearch.addEventListener("input", renderApptList);

        const tabs = document.getElementById("appt-tabs");
        if (tabs) {
            tabs.addEventListener("click", function (e) {
                const tab = e.target.closest("[data-status]");
                if (!tab) return;
                statusFilter = tab.dataset.status;
                renderApptList();
            });
        }

        // Close menus on outside click or Escape
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".sched-menu")) closeMenus();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            const open = document.querySelector("#appt-list .sched-menu-list:not([hidden])");
            if (!open) return;
            const t = open.parentNode.querySelector("[data-menu-toggle]");
            closeMenus();
            if (t) t.focus();
        });

        // Calendar: month navigation and day selection
        const cal = document.getElementById("appt-calendar");
        if (cal) {
            cal.addEventListener("click", function (e) {
                const nav = e.target.closest("[data-cal-nav]");
                if (nav) {
                    const kind = nav.dataset.calNav;
                    const base = calMonth || fromISO(Cohere.Utils.todayISO());
                    if (kind === "today") { calMonth = new Date(fromISO(Cohere.Utils.todayISO()).getFullYear(), fromISO(Cohere.Utils.todayISO()).getMonth(), 1); }
                    else calMonth = new Date(base.getFullYear(), base.getMonth() + (kind === "next" ? 1 : -1), 1);
                    renderApptList();
                    return;
                }
                const day = e.target.closest("[data-date]");
                if (!day) return;
                const iso = day.dataset.date;
                selectedDate = selectedDate === iso ? "" : iso;
                const d = fromISO(iso);
                if (calMonth && (d.getMonth() !== calMonth.getMonth() || d.getFullYear() !== calMonth.getFullYear())) calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
                renderApptList();
            });
        }

        // "Select all / Clear" per organization in the attendee picker
        if (apptMembers) {
            apptMembers.addEventListener("click", function (e) {
                const toggle = e.target.closest("[data-group-toggle]");
                if (!toggle) return;
                const boxes = Array.from(toggle.closest(".sched-org").querySelectorAll("input[type='checkbox']"));
                const allChecked = boxes.every(function (cb) { return cb.checked; });
                boxes.forEach(function (cb) { cb.checked = !allChecked; });
                updateGroupToggles();
                previewConflicts();
            });
        }
    }

    // Renders the entire appointments view
    function render() {
        renderApptForm();
        renderApptList();
        previewConflicts();
    }

    // Toggles location/link fields based on meeting type
    function toggleMeetingTypeFields() {
        const selectedType = document.querySelector('input[name="appt-meetingType"]:checked');
        const locationWrap = document.getElementById("appt-location-wrap");
        const linkWrap = document.getElementById("appt-meetingLink-wrap");

        if (!selectedType) return;

        if (selectedType.value === "Online") {
            locationWrap.hidden = true;
            linkWrap.hidden = false;
            document.getElementById("appt-location").value = "";
        } else {
            locationWrap.hidden = false;
            linkWrap.hidden = true;
            document.getElementById("appt-meetingLink").value = "";
        }
    }

    // Gets the selected meeting type
    function getMeetingType() {
        const selected = document.querySelector('input[name="appt-meetingType"]:checked');
        return selected ? selected.value : "In-person";
    }

    // Renders the appointment form (member checkboxes grouped by org)
    function renderApptForm() {
        const membersContainer = document.getElementById("appt-members");
        if (!membersContainer) return;
        Cohere.Utils.clearEl(membersContainer);

        const members = window.Cohere.state.members.filter(function (m) { return Cohere.Permissions.canManageOrgData(m.orgId); });
        if (members.length === 0) {
            membersContainer.appendChild(Cohere.Utils.createEl("p", { textContent: "No officers available. Add members first.", className: "text-muted" }));
            updateGroupToggles();
            return;
        }

        const grouped = {};
        members.forEach(function (m) {
            if (!grouped[m.orgId]) grouped[m.orgId] = [];
            grouped[m.orgId].push(m);
        });

        const editingId = document.getElementById("appt-id").value;
        let editingAppt = null;
        if (editingId) {
            editingAppt = Cohere.Store.getAppointment(editingId);
        }

        Object.keys(grouped).forEach(function (orgId) {
            const org = Cohere.Store.getOrg(orgId);
            const orgName = org ? org.name : "Unknown Organization";
            const groupDiv = Cohere.Utils.createEl("div", { className: "sched-org" });

            const head = Cohere.Utils.createEl("div", { className: "sched-org-head" });
            head.appendChild(Cohere.Utils.createEl("h4", { textContent: orgName }));
            head.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "sched-link-btn", textContent: "Select all", dataset: { groupToggle: "1" } }));
            groupDiv.appendChild(head);

            const chips = Cohere.Utils.createEl("div", { className: "sched-chips" });
            grouped[orgId].forEach(function (m) {
                const label = Cohere.Utils.createEl("label", { className: "att-chip" });
                const checkbox = Cohere.Utils.createEl("input", { type: "checkbox", value: m.id });
                if (editingAppt && editingAppt.memberIds.includes(m.id)) checkbox.checked = true;
                label.appendChild(checkbox);
                label.appendChild(Cohere.Utils.createEl("span", { className: "avatar", textContent: initials(m.fullName) }));
                const text = Cohere.Utils.createEl("span", { className: "att-text" });
                text.appendChild(Cohere.Utils.createEl("span", { className: "att-name", textContent: m.fullName }));
                text.appendChild(Cohere.Utils.createEl("span", { className: "att-role", textContent: m.position || "" }));
                label.appendChild(text);
                chips.appendChild(label);
            });
            groupDiv.appendChild(chips);
            membersContainer.appendChild(groupDiv);
        });
        updateGroupToggles();

        if (editingAppt) {
            document.getElementById("appt-title").value = editingAppt.title;
            document.getElementById("appt-date").value = editingAppt.date;
            document.getElementById("appt-start").value = editingAppt.startTime;
            document.getElementById("appt-end").value = editingAppt.endTime;
            document.getElementById("appt-notes").value = editingAppt.notes || "";

            // Set meeting type radio
            const meetingType = editingAppt.meetingType || "In-person";
            const radio = document.querySelector(`input[name="appt-meetingType"][value="${meetingType}"]`);
            if (radio) radio.checked = true;

            // Set location or link
            if (meetingType === "Online") {
                document.getElementById("appt-meetingLink").value = editingAppt.meetingLink || "";
            } else {
                document.getElementById("appt-location").value = editingAppt.location || "";
            }

            toggleMeetingTypeFields();

            document.getElementById("appt-submit").textContent = "Update Event";
            document.getElementById("appt-cancel").hidden = false;
        } else {
            // Reset to defaults
            const defaultRadio = document.querySelector('input[name="appt-meetingType"][value="In-person"]');
            if (defaultRadio) defaultRadio.checked = true;
            toggleMeetingTypeFields();
        }
    }

    // Keeps the per-organization toggle labels and the "N selected" pill in sync
    function updateGroupToggles() {
        document.querySelectorAll("#appt-members .sched-org").forEach(function (group) {
            const boxes = group.querySelectorAll("input[type='checkbox']");
            const all = boxes.length > 0 && Array.from(boxes).every(function (cb) { return cb.checked; });
            const btn = group.querySelector("[data-group-toggle]");
            if (btn) btn.textContent = all ? "Clear" : "Select all";
        });
        const pill = document.getElementById("appt-selected-count");
        if (pill) {
            const n = document.querySelectorAll("#appt-members input[type='checkbox']:checked").length;
            pill.hidden = n === 0;
            pill.textContent = n + " selected";
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
        const list = Cohere.Utils.createEl("ul", { className: "sched-conflict-list" });

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

    // Opens the form with the date pre-filled (used from the empty state of a picked day)
    function scheduleOnDate(iso) {
        const opener = document.querySelector('[data-open="appt-panel"]');
        if (opener) opener.click();
        const dateEl = document.getElementById("appt-date");
        if (dateEl && iso && !document.getElementById("appt-id").value) {
            dateEl.value = iso;
            previewConflicts();
        }
    }

    // Renders the month calendar: dots on days with events, click a day to filter the list
    function renderCalendar() {
        const host = document.getElementById("appt-calendar");
        if (!host) return;
        Cohere.Utils.clearEl(host);

        const today = Cohere.Utils.todayISO();
        if (!calMonth) { const t = fromISO(today); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); }
        const year = calMonth.getFullYear(), month = calMonth.getMonth();

        // date -> appointments
        const byDate = {};
        window.Cohere.state.appointments.forEach(function (a) {
            (byDate[a.date] = byDate[a.date] || []).push(a);
        });

        // Header: month title + nav
        const head = Cohere.Utils.createEl("div", { className: "cal-head" });
        head.appendChild(Cohere.Utils.createEl("h3", { textContent: calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }) }));
        const nav = Cohere.Utils.createEl("div", { className: "cal-nav" });
        nav.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "cal-btn", "aria-label": "Previous month", textContent: "‹", dataset: { calNav: "prev" } }));
        nav.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "cal-btn cal-today", textContent: "Today", dataset: { calNav: "today" } }));
        nav.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "cal-btn", "aria-label": "Next month", textContent: "›", dataset: { calNav: "next" } }));
        head.appendChild(nav);
        host.appendChild(head);

        // Weekday row
        const grid = Cohere.Utils.createEl("div", { className: "cal-grid", role: "grid" });
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (w) {
            grid.appendChild(Cohere.Utils.createEl("span", { className: "cal-dow", textContent: w.charAt(0), title: w, "aria-hidden": "true" }));
        });

        // Always 6 weeks so the height does not jump between months
        const first = new Date(year, month, 1);
        const start = new Date(year, month, 1 - first.getDay());
        for (let i = 0; i < 42; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const iso = toISO(d);
            const items = byDate[iso] || [];
            let cls = "cal-day";
            if (d.getMonth() !== month) cls += " is-out";
            if (iso === today) cls += " is-today";
            if (iso === selectedDate) cls += " is-selected";
            if (items.length) cls += " has-events";

            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
                (items.length ? ", " + items.length + (items.length === 1 ? " event" : " events") : "");
            const btn = Cohere.Utils.createEl("button", { type: "button", className: cls, "aria-label": label, "aria-pressed": iso === selectedDate ? "true" : "false", dataset: { date: iso } });
            btn.appendChild(Cohere.Utils.createEl("span", { className: "n", textContent: String(d.getDate()) }));
            const dots = Cohere.Utils.createEl("span", { className: "dots", "aria-hidden": "true" });
            items.slice(0, 3).forEach(function (a) {
                dots.appendChild(Cohere.Utils.createEl("i", { className: "dot dot-" + a.status.toLowerCase() }));
            });
            btn.appendChild(dots);
            grid.appendChild(btn);
        }
        host.appendChild(grid);

        // Legend
        const legend = Cohere.Utils.createEl("div", { className: "cal-legend" });
        [["scheduled", "Scheduled"], ["completed", "Completed"], ["cancelled", "Cancelled"]].forEach(function (l) {
            const item = Cohere.Utils.createEl("span");
            item.appendChild(Cohere.Utils.createEl("i", { className: "dot dot-" + l[0] }));
            item.appendChild(document.createTextNode(l[1]));
            legend.appendChild(item);
        });
        host.appendChild(legend);

        // This month at a glance
        const inMonth = window.Cohere.state.appointments.filter(function (a) {
            const d = fromISO(a.date);
            return d.getFullYear() === year && d.getMonth() === month && a.status !== "Cancelled";
        }).length;
        host.appendChild(Cohere.Utils.createEl("p", { className: "cal-summary", textContent: inMonth === 0 ? "No events this month" : inMonth + (inMonth === 1 ? " event" : " events") + " this month" }));
    }

    // Renders the status tabs (with counts) above the list
    function renderTabs(counts) {
        const tabs = document.getElementById("appt-tabs");
        if (!tabs) return;
        Cohere.Utils.clearEl(tabs);
        STATUS_TABS.forEach(function (t) {
            const active = t.value === statusFilter;
            const btn = Cohere.Utils.createEl("button", {
                type: "button",
                className: "sched-tab" + (active ? " is-active" : ""),
                "aria-pressed": active ? "true" : "false",
                dataset: { status: t.value }
            });
            btn.appendChild(document.createTextNode(t.label));
            btn.appendChild(Cohere.Utils.createEl("span", { className: "sched-tab-count", textContent: String(counts[t.value] || 0) }));
            tabs.appendChild(btn);
        });
    }

    // Builds one event card
    function buildCard(appt, groupKey) {
        const card = Cohere.Utils.createEl("article", { className: "sched-card is-" + groupKey });

        // Date block
        const dp = dateParts(appt.date);
        const dateBlock = Cohere.Utils.createEl("div", { className: "sched-date", "aria-hidden": "true" });
        dateBlock.appendChild(Cohere.Utils.createEl("span", { className: "m", textContent: dp.month }));
        dateBlock.appendChild(Cohere.Utils.createEl("span", { className: "d", textContent: String(dp.day) }));
        dateBlock.appendChild(Cohere.Utils.createEl("span", { className: "w", textContent: dp.weekday }));
        card.appendChild(dateBlock);

        const main = Cohere.Utils.createEl("div", { className: "sched-main" });

        // Title + status
        const top = Cohere.Utils.createEl("div", { className: "sched-top" });
        top.appendChild(Cohere.Utils.createEl("h3", { textContent: appt.title }));
        const statusKind = appt.status === "Completed" ? "completed" : appt.status === "Cancelled" ? "cancelled" : "pending";
        top.appendChild(Cohere.UI.statusBadge(appt.status, statusKind));
        main.appendChild(top);

        // When + where
        const meta = Cohere.Utils.createEl("ul", { className: "sched-meta" });

        const when = Cohere.Utils.createEl("li");
        when.appendChild(icon("i-clock"));
        const whenText = Cohere.Utils.createEl("span", { textContent: Cohere.Utils.formatTime(appt.startTime) + " – " + Cohere.Utils.formatTime(appt.endTime) });
        when.appendChild(whenText);
        const dur = durationLabel(appt.startTime, appt.endTime);
        if (dur) when.appendChild(Cohere.Utils.createEl("span", { className: "sched-dim", textContent: "· " + dur }));
        if (dp.year !== new Date().getFullYear()) when.appendChild(Cohere.Utils.createEl("span", { className: "sched-dim", textContent: "· " + dp.year }));
        meta.appendChild(when);

        const where = Cohere.Utils.createEl("li");
        const meetingType = appt.meetingType || "In-person";
        if (meetingType === "Online") {
            where.appendChild(icon("i-link"));
            if (appt.meetingLink && /^https?:\/\//i.test(appt.meetingLink)) {
                where.appendChild(Cohere.Utils.createEl("a", {
                    textContent: shortLink(appt.meetingLink),
                    href: appt.meetingLink,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    title: appt.meetingLink
                }));
            } else {
                where.appendChild(Cohere.Utils.createEl("span", { className: "sched-dim", textContent: appt.meetingLink || "Online · no link yet" }));
            }
        } else {
            where.appendChild(icon("i-pin"));
            where.appendChild(Cohere.Utils.createEl("span", { textContent: appt.location || "No location set" }));
        }
        meta.appendChild(where);
        main.appendChild(meta);

        // Invitees: avatar stack + short names
        const names = appt.memberIds.map(function (id) { return Cohere.Store.getMemberName(id); });
        const people = Cohere.Utils.createEl("div", { className: "sched-people", title: names.join(", ") });
        if (names.length === 0) {
            people.appendChild(Cohere.Utils.createEl("span", { className: "sched-dim", textContent: "No invitees" }));
        } else {
            const stack = Cohere.Utils.createEl("span", { className: "avatar-stack" });
            names.slice(0, 4).forEach(function (n) {
                stack.appendChild(Cohere.Utils.createEl("span", { className: "avatar", textContent: initials(n) }));
            });
            if (names.length > 4) stack.appendChild(Cohere.Utils.createEl("span", { className: "avatar more", textContent: "+" + (names.length - 4) }));
            people.appendChild(stack);
            const summary = names.length <= 2 ? names.join(", ") : names.slice(0, 2).join(", ") + " +" + (names.length - 2) + " more";
            people.appendChild(Cohere.Utils.createEl("span", { className: "sched-people-text", textContent: summary }));
        }
        main.appendChild(people);

        if (appt.notes) {
            main.appendChild(Cohere.Utils.createEl("p", { className: "sched-notes", textContent: appt.notes }));
        }
        card.appendChild(main);

        // Actions
        const actions = Cohere.Utils.createEl("div", { className: "sched-actions" });
        actions.appendChild(Cohere.Utils.createEl("button", { type: "button", textContent: "Attendance", className: "btn", dataset: { action: "attendance", id: appt.id } }));
        if (Cohere.Permissions.canManageMeeting(appt)) {
            const menu = Cohere.Utils.createEl("div", { className: "sched-menu" });
            const toggle = Cohere.Utils.createEl("button", { type: "button", className: "sched-kebab", "aria-label": "More actions for " + appt.title, "aria-haspopup": "menu", "aria-expanded": "false", dataset: { menuToggle: "1" } });
            toggle.appendChild(dotsIcon());
            menu.appendChild(toggle);

            const list = Cohere.Utils.createEl("div", { className: "sched-menu-list", role: "menu", hidden: "" });
            list.appendChild(Cohere.Utils.createEl("button", { type: "button", role: "menuitem", className: "sched-menu-item", textContent: "Edit event", dataset: { action: "edit", id: appt.id } }));
            if (appt.status === "Scheduled") {
                list.appendChild(Cohere.Utils.createEl("button", { type: "button", role: "menuitem", className: "sched-menu-item", textContent: "Cancel event", dataset: { action: "cancel-meeting", id: appt.id } }));
            }
            list.appendChild(Cohere.Utils.createEl("div", { className: "sched-menu-sep", role: "separator" }));
            list.appendChild(Cohere.Utils.createEl("button", { type: "button", role: "menuitem", className: "sched-menu-item is-danger", textContent: "Delete event", dataset: { action: "delete", id: appt.id } }));
            menu.appendChild(list);
            actions.appendChild(menu);
        }
        card.appendChild(actions);

        return card;
    }

    // Renders the appointment list: filters, tabs, then cards grouped by when they happen
    function renderApptList() {
        const listContainer = document.getElementById("appt-list");
        if (!listContainer) return;
        Cohere.Utils.clearEl(listContainer);

        const search = (document.getElementById("appt-search").value || "").toLowerCase();
        const today = Cohere.Utils.todayISO();

        renderCalendar();

        // Search and picked day first, so the tab counts reflect what the person is looking for
        let appointments = window.Cohere.state.appointments.slice();
        if (selectedDate) appointments = appointments.filter(function (a) { return a.date === selectedDate; });
        if (search) {
            appointments = appointments.filter(function (a) {
                const locationOrLink = a.meetingType === "Online" ? (a.meetingLink || "") : (a.location || "");
                return a.title.toLowerCase().includes(search) || locationOrLink.toLowerCase().includes(search);
            });
        }

        const counts = { "": appointments.length, Scheduled: 0, Completed: 0, Cancelled: 0 };
        appointments.forEach(function (a) { if (counts[a.status] !== undefined) counts[a.status]++; });
        renderTabs(counts);

        if (statusFilter) appointments = appointments.filter(function (a) { return a.status === statusFilter; });

        // Chip showing the picked day, with a way to clear it
        if (selectedDate) {
            const chip = Cohere.Utils.createEl("div", { className: "sched-date-chip" });
            chip.appendChild(Cohere.Utils.createEl("span", { textContent: "Showing " + fromISO(selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) }));
            chip.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "sched-link-btn", textContent: "Show all", dataset: { action: "clear-date" } }));
            listContainer.appendChild(chip);
        }

        if (appointments.length === 0) {
            const filtering = !!(search || statusFilter || selectedDate);
            const empty = Cohere.Utils.createEl("div", { className: "sched-empty" });
            empty.appendChild(icon("i-cal"));
            const canAdd = Cohere.Permissions.can("manageMeetings");
            const title = selectedDate && !search && !statusFilter ? "Nothing scheduled this day" : (filtering ? "No events match your filters" : "No events yet");
            empty.appendChild(Cohere.Utils.createEl("strong", { textContent: title }));
            empty.appendChild(Cohere.Utils.createEl("span", { textContent: filtering ? "Try a different day, search or status." : (canAdd ? "Use Schedule Meeting to add your first one." : "Events will appear here once they are scheduled.") }));
            if (selectedDate && canAdd) {
                empty.appendChild(Cohere.Utils.createEl("button", { type: "button", className: "btn", textContent: "Schedule on this day", dataset: { action: "new-on-date" } }));
            }
            listContainer.appendChild(empty);
            return;
        }

        // Bucket into groups
        const buckets = {};
        GROUPS.forEach(function (g) { buckets[g.key] = []; });
        appointments.forEach(function (a) { buckets[groupKeyFor(a, today)].push(a); });

        GROUPS.forEach(function (g) {
            const items = buckets[g.key];
            if (!items.length) return;
            const ascending = g.key === "today" || g.key === "upcoming";
            items.sort(function (a, b) {
                const cmp = a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
                return ascending ? cmp : -cmp;
            });

            const section = Cohere.Utils.createEl("section", { className: "sched-group is-" + g.key });
            const head = Cohere.Utils.createEl("div", { className: "sched-group-head" });
            head.appendChild(Cohere.Utils.createEl("h3", { textContent: g.label }));
            head.appendChild(Cohere.Utils.createEl("span", { className: "sched-count-pill", textContent: String(items.length) }));
            section.appendChild(head);

            const grid = Cohere.Utils.createEl("div", { className: "sched-grid" });
            items.forEach(function (appt) { grid.appendChild(buildCard(appt, g.key)); });
            section.appendChild(grid);
            listContainer.appendChild(section);
        });
    }

    // Handles appointment form submission (E21)
    function handleApptSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = document.getElementById("appt-id").value;

        const meetingType = getMeetingType();
        const values = {
            title: document.getElementById("appt-title").value,
            date: document.getElementById("appt-date").value,
            startTime: document.getElementById("appt-start").value,
            endTime: document.getElementById("appt-end").value,
            location: meetingType === "In-person" ? document.getElementById("appt-location").value : "",
            meetingLink: meetingType === "Online" ? document.getElementById("appt-meetingLink").value : "",
            meetingType: meetingType,
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
            Cohere.UI.showToast(editingId ? "Event updated." : "Event scheduled.", "success");
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
        renderApptForm();
        previewConflicts();
        document.getElementById("appt-title").focus();
    }

    // Handles meeting cancellation (E23)
    function handleCancelMeeting(id) {
        const appt = Cohere.Store.getAppointment(id);
        if (!appt) return;
        if (!Cohere.UI.confirmAction("Cancel event \"" + appt.title + "\"?")) return;
        const result = Cohere.Store.cancelAppointment(id);
        if (result.ok) {
            Cohere.UI.showToast("Event cancelled.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Handles appointment deletion
    function handleDeleteAppt(id) {
        const appt = Cohere.Store.getAppointment(id);
        if (!appt) return;
        if (!Cohere.UI.confirmAction("Delete event \"" + appt.title + "\"? This will also delete all attendance records for this event.")) return;
        const result = Cohere.Store.deleteAppointment(id);
        if (result.ok) {
            Cohere.UI.showToast("Event deleted.", "success");
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
            document.getElementById("appt-submit").textContent = "Schedule Event";
            document.getElementById("appt-cancel").hidden = true;
            Cohere.UI.clearFieldErrors(form);
            const membersError = form.querySelector("#appt-members + .field-error");
            if (membersError) membersError.remove();
            document.querySelectorAll("#appt-members input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
            updateGroupToggles();
            const conflictBox = document.getElementById("appt-conflict-box");
            if (conflictBox) {
                conflictBox.hidden = true;
                Cohere.Utils.clearEl(conflictBox);
            }
            // Reset meeting type to default
            const defaultRadio = document.querySelector('input[name="appt-meetingType"][value="In-person"]');
            if (defaultRadio) defaultRadio.checked = true;
            toggleMeetingTypeFields();
        }
    }

    return { init, render, renderApptList, previewConflicts, openAttendance };
})();