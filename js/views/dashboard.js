window.Cohere = window.Cohere || {};
Cohere.Dashboard = (function () {
    "use strict";

    // Initializes the dashboard view (no one-time listeners needed; render() is
    // called by app.js's renderAll() after every mutation)
    function init() {
        // Re-render when the viewing-as profile changes so My Tasks updates
        const viewingAs = document.getElementById("viewing-as");
        if (viewingAs && !viewingAs.getAttribute("data-dashboard-wired")) {
            viewingAs.addEventListener("change", function () {
                render();
            });
            viewingAs.setAttribute("data-dashboard-wired", "1");
        }
    }

    // Renders the entire dashboard view
    function render() {
        const stats = Cohere.Services.getDashboardStats();
        renderStatCards(stats);
        renderTaskStatusBars(stats.taskStatusCounts);
        renderDueSoon(stats.dueSoon);
        renderUpcoming(stats.upcoming);
        renderTopOfficers(stats.topOfficers);
        renderRecentActivity(stats.recentActivity);
        renderMyTasks();
    }

    // Renders the top stat cards
    function renderStatCards(stats) {
        const container = document.getElementById("stat-cards");
        if (!container) return;
        Cohere.Utils.clearEl(container);

        const cards = [
            { label: "Members", value: stats.totalMembers },
            { label: "Tasks", value: stats.totalTasks },
            { label: "Completed tasks", value: stats.completedTasks },
            { label: "Overdue tasks", value: stats.overdueTasks },
            { label: "Upcoming meetings", value: stats.upcomingMeetings },
            { label: "Avg attendance", value: Cohere.Utils.formatPercent(stats.averageAttendanceRate) }
        ];

        cards.forEach(function (c) {
            const card = Cohere.Utils.createEl("div", { className: "card" });
            card.appendChild(Cohere.Utils.createEl("h3", { textContent: c.label }));
            card.appendChild(Cohere.Utils.createEl("div", { className: "value", textContent: String(c.value) }));
            container.appendChild(card);
        });
    }

    // Renders the task status bars (Pending / In Progress / Completed)
    function renderTaskStatusBars(counts) {
        const box = document.getElementById("dash-task-status");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "Task status" }));

        const total = counts["Pending"] + counts["In Progress"] + counts["Completed"];
        if (total === 0) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "No tasks yet.",
                className: "text-muted"
            }));
            return;
        }

        [["Pending", "pending"], ["In Progress", "progress"], ["Completed", "completed"]].forEach(function (pair) {
            const key = pair[0];
            const badgeKind = pair[1];
            const count = counts[key];
            const pct = (count / total) * 100;

            const row = Cohere.Utils.createEl("div", { style: "margin-bottom: 8px;" });

            const header = Cohere.Utils.createEl("div", {
                style: "display: flex; justify-content: space-between; margin-bottom: 4px;"
            });
            header.appendChild(Cohere.UI.statusBadge(key, badgeKind));
            header.appendChild(Cohere.Utils.createEl("span", {
                textContent: count + " (" + pct.toFixed(0) + "%)",
                className: "text-muted"
            }));
            row.appendChild(header);

            const bar = Cohere.Utils.createEl("div", { className: "bar" });
            const fill = Cohere.Utils.createEl("div", { className: "bar-fill" });
            fill.style.width = pct + "%";
            bar.appendChild(fill);
            row.appendChild(bar);

            box.appendChild(row);
        });
    }

    // Renders the "Due soon" list
    function renderDueSoon(tasks) {
        const box = document.getElementById("dash-due-soon");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "Due soon" }));

        if (!tasks.length) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "Nothing due in the next few days.",
                className: "text-muted"
            }));
            return;
        }

        const list = Cohere.Utils.createEl("ul", { style: "list-style: none; padding: 0;" });
        tasks.forEach(function (t) {
            const li = Cohere.Utils.createEl("li", {
                style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);"
            });
            li.appendChild(Cohere.Utils.createEl("strong", { textContent: t.title }));
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: Cohere.Store.getMemberName(t.assigneeId) + " · Due " + Cohere.Utils.formatDate(t.deadline),
                className: "text-muted",
                style: "font-size: 0.875rem;"
            }));
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    // Renders the "Upcoming meetings" list
    function renderUpcoming(appointments) {
        const box = document.getElementById("dash-upcoming");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "Upcoming meetings" }));

        if (!appointments.length) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "No upcoming meetings.",
                className: "text-muted"
            }));
            return;
        }

        const list = Cohere.Utils.createEl("ul", { style: "list-style: none; padding: 0;" });
        appointments.forEach(function (a) {
            const li = Cohere.Utils.createEl("li", {
                style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);"
            });
            li.appendChild(Cohere.Utils.createEl("strong", { textContent: a.title }));
            const when = Cohere.Utils.formatDate(a.date) + " · " +
                Cohere.Utils.formatTime(a.startTime) + "–" + Cohere.Utils.formatTime(a.endTime);
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: when + (a.location ? " · " + a.location : ""),
                className: "text-muted",
                style: "font-size: 0.875rem;"
            }));
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    // Renders the "Top officers" list
    function renderTopOfficers(officers) {
        const box = document.getElementById("dash-top-officers");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "Top officers" }));

        if (!officers.length) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "No officer data yet.",
                className: "text-muted"
            }));
            return;
        }

        const list = Cohere.Utils.createEl("ul", { style: "list-style: none; padding: 0;" });
        officers.forEach(function (o, i) {
            const org = Cohere.Store.getOrg(o.orgId);
            const li = Cohere.Utils.createEl("li", {
                style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);"
            });
            li.appendChild(Cohere.Utils.createEl("strong", { textContent: (i + 1) + ". " + o.fullName }));
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: (org ? org.name : "Unknown org") + " · " + Cohere.Utils.formatPercent(o.overallScore),
                className: "text-muted",
                style: "font-size: 0.875rem;"
            }));
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    // Renders the "Recent activity" list
    function renderRecentActivity(entries) {
        const box = document.getElementById("dash-recent-activity");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "Recent activity" }));

        if (!entries.length) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "No activity yet.",
                className: "text-muted"
            }));
            return;
        }

        const list = Cohere.Utils.createEl("ul", { style: "list-style: none; padding: 0;" });
        entries.forEach(function (e) {
            const li = Cohere.Utils.createEl("li", {
                style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);"
            });
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: e.type + " · " + e.message
            }));
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: Cohere.Utils.formatDateTime(e.timestamp) + " · " + e.actorName,
                className: "text-muted",
                style: "font-size: 0.75rem;"
            }));
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    // Renders the "My tasks" block (only for a specific member, not admin)
    function renderMyTasks() {
        const box = document.getElementById("dash-my-tasks");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        const actor = Cohere.Permissions.getActor();
        if (!actor || actor.isAdmin) {
            box.hidden = true;
            return;
        }

        box.hidden = false;
        box.appendChild(Cohere.Utils.createEl("h3", { textContent: "My tasks" }));

        const tasks = Cohere.Services.getMyTasks(actor.id);
        if (!tasks.length) {
            box.appendChild(Cohere.Utils.createEl("p", {
                textContent: "You have no open tasks.",
                className: "text-muted"
            }));
            return;
        }

        const list = Cohere.Utils.createEl("ul", { style: "list-style: none; padding: 0;" });
        tasks.forEach(function (t) {
            const li = Cohere.Utils.createEl("li", {
                style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);"
            });
            li.appendChild(Cohere.Utils.createEl("strong", { textContent: t.title }));
            li.appendChild(Cohere.Utils.createEl("div", {
                textContent: t.priority + " priority · Due " + Cohere.Utils.formatDate(t.deadline),
                className: "text-muted",
                style: "font-size: 0.875rem;"
            }));
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    return { init, render };
})();