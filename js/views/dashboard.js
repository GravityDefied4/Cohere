window.Cohere = window.Cohere || {};
Cohere.Dashboard = (function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const $ = function (id) { return document.getElementById(id); };

    // ------------------------------------------------------------------
    // Small DOM helpers
    // ------------------------------------------------------------------

    // h("div", "class-name", "text", [children])
    function h(tag, className, text, children) {
        const props = {};
        if (className) props.className = className;
        if (text !== undefined && text !== null) props.textContent = String(text);
        return Cohere.Utils.createEl(tag, props, children);
    }

    // <svg class="ic"><use href="#id"/></svg> using the sprite in index.html
    function icon(id) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "ic");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", "#" + id);
        svg.appendChild(use);
        return svg;
    }

    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

    function initials(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        return ((parts[0] || "?").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
    }

    function toDate(iso) {
        const p = iso.split("-");
        return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    }

    // Whole days from today to the given ISO date (negative = past)
    function dayDiff(iso) {
        return Math.round((toDate(iso) - toDate(Cohere.Utils.todayISO())) / 86400000);
    }

    // { text, tone } for a deadline
    function dueLabel(iso) {
        if (!iso) return { text: "No deadline", tone: "" };
        const d = dayDiff(iso);
        if (d < 0) return { text: d === -1 ? "1 day overdue" : Math.abs(d) + " days overdue", tone: "danger" };
        if (d === 0) return { text: "Due today", tone: "warn" };
        if (d === 1) return { text: "Due tomorrow", tone: "warn" };
        return { text: "Due in " + d + " days", tone: "" };
    }

    function memberOf(id) {
        return (window.Cohere.state.members || []).find(function (m) { return m.id === id; }) || null;
    }

    function chip(text, tone) { return h("span", "chip" + (tone ? " chip-" + tone : ""), text); }

    function priorityBadge(priority) {
        return Cohere.UI.statusBadge(priority, String(priority || "").toLowerCase());
    }

    function emptyState(iconId, title, hint) {
        const box = h("div", "dp-empty");
        const ic = h("span", "dp-empty-ic");
        ic.appendChild(icon(iconId));
        box.appendChild(ic);
        box.appendChild(h("strong", null, title));
        if (hint) box.appendChild(h("span", null, hint));
        return box;
    }

    // Clears a panel, draws its header, and returns the body element.
    // opts: { meta: "3 items", goto: "tasks", gotoLabel: "View all" }
    function panel(boxId, title, opts) {
        const box = $(boxId);
        if (!box) return null;
        opts = opts || {};
        Cohere.Utils.clearEl(box);

        const head = h("header", "dp-head");
        const titles = h("div", "dp-titles");
        titles.appendChild(h("h2", "dp-title", title));
        if (opts.meta) titles.appendChild(h("span", "dp-meta", opts.meta));
        head.appendChild(titles);

        if (opts.goto) {
            const link = h("button", "dp-link", opts.gotoLabel || "View all");
            link.type = "button";
            link.dataset.goto = opts.goto;
            link.appendChild(icon("i-arrow"));
            head.appendChild(link);
        }
        box.appendChild(head);

        const body = h("div", "dp-body");
        box.appendChild(body);
        return body;
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    // One delegated listener handles every "go to another view" button.
    function init() {
        const view = $("view-dashboard");
        if (!view || view.getAttribute("data-dashboard-wired")) return;
        view.addEventListener("click", function (e) {
            const btn = e.target.closest("[data-goto]");
            if (btn && Cohere.App) Cohere.App.showView(btn.dataset.goto);
        });
        view.setAttribute("data-dashboard-wired", "1");
    }

    function render() {
        const stats = Cohere.Services.getDashboardStats();
        renderHero(stats);
        renderTaskStatus(stats.taskStatusCounts);
        renderDueSoon(stats.dueSoon);
        renderUpcoming(stats.upcoming);
    }

    // ------------------------------------------------------------------
    // Hero: greeting
    // ------------------------------------------------------------------

    function greeting() {
        const hr = new Date().getHours();
        return hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    }

    function renderHero(stats) {
        const box = $("dash-hero");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        const actor = Cohere.Permissions.getActor();
        const firstName = actor.isAdmin ? "Administrator" : String(actor.name).split(" ")[0];
        const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

        box.appendChild(h("p", "hero-eyebrow", today));
        const title = h("h2", "hero-title", greeting() + ", ");
        title.appendChild(h("span", null, firstName));
        box.appendChild(title);
    }

    // ------------------------------------------------------------------
    // Task status: donut + legend
    // ------------------------------------------------------------------

    function renderTaskStatus(counts) {
        const total = counts["Pending"] + counts["In Progress"] + counts["Completed"];
        const body = panel("dash-task-status", "Task status", {
            meta: total ? plural(total, "task") + " in total" : null,
            goto: "tasks", gotoLabel: "Manage tasks"
        });
        if (!body) return;
        if (!total) {
            body.appendChild(emptyState("i-tasks", "No tasks yet", "Delegated tasks will be tracked here."));
            return;
        }

        const segments = [
            { key: "Pending", cls: "s-pending" },
            { key: "In Progress", cls: "s-progress" },
            { key: "Completed", cls: "s-completed" }
        ];

        // Donut
        const R = 46, C = 2 * Math.PI * R;
        const wrap = h("div", "donut");
        wrap.setAttribute("role", "img");
        wrap.setAttribute("aria-label", counts["Completed"] + " of " + total + " tasks completed");
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 120 120");
        svg.setAttribute("aria-hidden", "true");

        const track = document.createElementNS(SVG_NS, "circle");
        track.setAttribute("class", "donut-track");
        track.setAttribute("cx", "60"); track.setAttribute("cy", "60"); track.setAttribute("r", String(R));
        svg.appendChild(track);

        let offset = 0;
        segments.forEach(function (s) {
            const len = (counts[s.key] / total) * C;
            if (len <= 0) return;
            const arc = document.createElementNS(SVG_NS, "circle");
            arc.setAttribute("class", "donut-arc " + s.cls);
            arc.setAttribute("cx", "60"); arc.setAttribute("cy", "60"); arc.setAttribute("r", String(R));
            arc.setAttribute("stroke-dasharray", Math.max(0, len - 2) + " " + (C - Math.max(0, len - 2)));
            arc.setAttribute("stroke-dashoffset", String(-offset));
            svg.appendChild(arc);
            offset += len;
        });
        wrap.appendChild(svg);

        const center = h("div", "donut-center");
        center.appendChild(h("strong", null, Math.round((counts["Completed"] / total) * 100) + "%"));
        center.appendChild(h("span", null, "complete"));
        wrap.appendChild(center);

        // Legend with bars
        const legend = h("ul", "status-legend");
        segments.forEach(function (s) {
            const count = counts[s.key];
            const pct = Math.round((count / total) * 100);
            const li = h("li", "status-row " + s.cls);
            const line = h("div", "status-line");
            const name = h("span", "status-name");
            name.appendChild(h("i", "status-dot"));
            name.appendChild(document.createTextNode(s.key));
            line.appendChild(name);
            const nums = h("span", "status-nums");
            nums.appendChild(h("strong", null, count));
            nums.appendChild(h("span", null, pct + "%"));
            line.appendChild(nums);
            li.appendChild(line);
            const bar = h("div", "meter");
            const fill = h("span");
            fill.style.width = pct + "%";
            bar.appendChild(fill);
            li.appendChild(bar);
            legend.appendChild(li);
        });

        const layout = h("div", "status-layout");
        layout.appendChild(wrap);
        layout.appendChild(legend);
        body.appendChild(layout);
    }

    // ------------------------------------------------------------------
    // Due soon
    // ------------------------------------------------------------------

    function renderDueSoon(tasks) {
        const body = panel("dash-due-soon", "Due soon", {
            meta: "Next " + Cohere.Config.REMINDER_DAYS + " days", goto: "tasks", gotoLabel: "All tasks"
        });
        if (!body) return;
        if (!tasks.length) {
            body.appendChild(emptyState("i-checkall", "Nothing due soon", "No open deadlines in the next few days."));
            return;
        }

        const list = h("ul", "row-list");
        tasks.forEach(function (t) {
            const m = memberOf(t.assigneeId);
            const org = m ? Cohere.Store.getOrg(m.orgId) : null;
            const due = dueLabel(t.deadline);

            const li = h("li", "row");
            li.appendChild(h("span", "avatar-sm", initials(m ? m.fullName : "?")));
            const info = h("div", "row-info");
            info.appendChild(h("strong", null, t.title));
            info.appendChild(h("span", "muted-line",
                Cohere.Store.getMemberName(t.assigneeId) + (org ? " · " + org.name : "")));
            li.appendChild(info);

            const side = h("div", "row-side");
            side.appendChild(chip(due.text, due.tone));
            side.appendChild(priorityBadge(t.priority));
            li.appendChild(side);
            list.appendChild(li);
        });
        body.appendChild(list);
    }

    // ------------------------------------------------------------------
    // Upcoming meetings
    // ------------------------------------------------------------------

    function renderUpcoming(appointments) {
        const body = panel("dash-upcoming", "Upcoming meetings", {
            meta: appointments.length ? "Next " + plural(appointments.length, "meeting") : null,
            goto: "appointments", gotoLabel: "Schedule"
        });
        if (!body) return;
        if (!appointments.length) {
            body.appendChild(emptyState("i-cal", "No upcoming meetings", "Scheduled meetings will show up here."));
            return;
        }

        const list = h("ul", "row-list");
        appointments.forEach(function (a) {
            const d = toDate(a.date);
            const isToday = a.date === Cohere.Utils.todayISO();

            const li = h("li", "row");
            const tile = h("span", "date-tile" + (isToday ? " is-today" : ""));
            tile.appendChild(h("small", null, d.toLocaleDateString("en-US", { month: "short" })));
            tile.appendChild(h("strong", null, d.getDate()));
            li.appendChild(tile);

            const info = h("div", "row-info");
            info.appendChild(h("strong", null, a.title));
            info.appendChild(h("span", "muted-line",
                Cohere.Utils.formatTime(a.startTime) + "–" + Cohere.Utils.formatTime(a.endTime) +
                (a.location ? " · " + a.location : "")));
            li.appendChild(info);

            const side = h("div", "row-side");
            if (isToday) side.appendChild(chip("Today", "warn"));
            const people = h("span", "people");
            people.appendChild(icon("i-users"));
            people.appendChild(document.createTextNode(String((a.memberIds || []).length)));
            people.setAttribute("title", plural((a.memberIds || []).length, "attendee"));
            side.appendChild(people);
            li.appendChild(side);
            list.appendChild(li);
        });
        body.appendChild(list);
    }

    return { init, render };
})();