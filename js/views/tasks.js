window.Cohere = window.Cohere || {};
Cohere.Tasks = (function () {
    "use strict";

    // Status tabs above the list. "overdue" is a derived filter, not a stored status.
    const TABS = [
        { value: "all", label: "All" },
        { value: "Pending", label: "Pending" },
        { value: "In Progress", label: "In Progress" },
        { value: "Completed", label: "Completed" },
        { value: "overdue", label: "Overdue" }
    ];
    let statusTab = "all";

    // Initializes the tasks view (attach listeners once)
    function init() {
        const form = document.getElementById("task-form");
        if (form) form.addEventListener("submit", handleTaskSubmit);

        const cancel = document.getElementById("task-cancel");
        if (cancel) cancel.addEventListener("click", resetTaskForm);

        // Status change reveals/hides the completion field
        const statusSelect = document.getElementById("task-status");
        if (statusSelect) statusSelect.addEventListener("change", toggleCompletedField);

        // Live search and filters/sort
        const search = document.getElementById("task-search");
        if (search) search.addEventListener("input", renderTaskList);

        ["task-filter-priority", "task-filter-assignee", "task-sort"].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", renderTaskList);
        });

        // Status tabs
        const tabs = document.getElementById("task-tabs");
        if (tabs) {
            tabs.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-tab]");
                if (!btn) return;
                statusTab = btn.dataset.tab;
                renderTaskList();
            });
        }

        // "..." menu on each row (same menu as the Organization tab)
        const list = document.getElementById("task-list");
        if (list) {
            list.addEventListener("click", function (e) {
                const btn = e.target.closest(".kebab-btn");
                if (!btn) return;
                const task = Cohere.Store.getTask(btn.dataset.id);
                if (!task) return;
                Cohere.Members.openActionMenu(btn, menuItems(task));
            });
        }
    }

    // Renders the entire tasks view
    function render() {
        renderTaskFormDropdowns();
        renderTaskFilterDropdowns();
        toggleCompletedField();
        renderTaskList();
    }

    // Populates the form dropdowns (assignee, priority, status)
    function renderTaskFormDropdowns() {
        const assigneeSelect = document.getElementById("task-assigneeId");
        if (assigneeSelect) {
            // Admin can assign anyone; others only members of their own organization
            const members = window.Cohere.state.members.filter(function (m) { return Cohere.Permissions.canManageOrgData(m.orgId); }).map(function (m) {
                const org = Cohere.Store.getOrg(m.orgId);
                const orgName = org ? org.name : "Unknown";
                return { value: m.id, label: m.fullName + " — " + orgName };
            });
            Cohere.Utils.populateSelect(assigneeSelect, members, "Select an assignee");
        }

        const prioritySelect = document.getElementById("task-priority");
        if (prioritySelect) {
            const priorities = Cohere.Config.PRIORITIES.map(function (p) {
                return { value: p, label: p };
            });
            Cohere.Utils.populateSelect(prioritySelect, priorities, "Select a priority");
        }

        const statusSelect = document.getElementById("task-status");
        if (statusSelect) {
            const statuses = Cohere.Config.TASK_STATUSES.map(function (s) {
                return { value: s, label: s };
            });
            Cohere.Utils.populateSelect(statusSelect, statuses, "Select a status");
        }

        // If editing, fill the form
        const editingId = document.getElementById("task-id").value;
        if (editingId) {
            const task = Cohere.Store.getTask(editingId);
            if (task) fillForm(task);
        } else {
            applyDefaults();
        }
    }

    // Populates the filter and sort dropdowns
    function renderTaskFilterDropdowns() {
        const priorityFilter = document.getElementById("task-filter-priority");
        if (priorityFilter) {
            const items = Cohere.Config.PRIORITIES.map(function (p) { return { value: p, label: p }; });
            const current = priorityFilter.value;
            Cohere.Utils.populateSelect(priorityFilter, items, "All priorities");
            priorityFilter.value = current;
        }

        const assigneeFilter = document.getElementById("task-filter-assignee");
        if (assigneeFilter) {
            const members = window.Cohere.state.members.filter(function (m) { return Cohere.Permissions.canManageOrgData(m.orgId); }).map(function (m) {
                return { value: m.id, label: m.fullName };
            });
            const current = assigneeFilter.value;
            Cohere.Utils.populateSelect(assigneeFilter, members, "All assignees");
            assigneeFilter.value = current;
        }

        const sortSelect = document.getElementById("task-sort");
        if (sortSelect) {
            const items = [
                { value: "deadline-asc", label: "Deadline (soonest)" },
                { value: "deadline-desc", label: "Deadline (latest)" },
                { value: "priority", label: "Priority (High to Low)" },
                { value: "title", label: "Title (A to Z)" }
            ];
            const current = sortSelect.value || "deadline-asc";
            Cohere.Utils.populateSelect(sortSelect, items, null);
            sortSelect.value = current;
        }
    }

    // Shows the completion date field only when status is Completed
    function toggleCompletedField() {
        const statusSelect = document.getElementById("task-status");
        const wrap = document.getElementById("task-completed-wrap");
        const completedInput = document.getElementById("task-completedAt");
        if (!statusSelect || !wrap) return;

        if (statusSelect.value === "Completed") {
            wrap.hidden = false;
            if (completedInput && !completedInput.value) {
                completedInput.value = Cohere.Utils.todayISO();
            }
        } else {
            wrap.hidden = true;
            if (completedInput) completedInput.value = "";
        }
    }

    // New tasks start as Medium priority and Pending, so most only need a name, assignee and deadline
    function applyDefaults() {
        const priority = document.getElementById("task-priority");
        const status = document.getElementById("task-status");
        if (priority && !priority.value) priority.value = "Medium";
        if (status && !status.value) status.value = "Pending";
    }

    // Switches the form between "Add" and "Edit" wording
    function setFormMode(editing) {
        const title = document.getElementById("task-panel-title");
        if (title) title.textContent = editing ? "Edit Task" : "Add Task";
        document.getElementById("task-submit").textContent = editing ? "Update Task" : "Add Task";
    }

    function fillForm(task) {
        document.getElementById("task-id").value = task.id;
        document.getElementById("task-title").value = task.title;
        document.getElementById("task-description").value = task.description || "";
        document.getElementById("task-assigneeId").value = task.assigneeId;
        document.getElementById("task-priority").value = task.priority;
        document.getElementById("task-deadline").value = task.deadline;
        document.getElementById("task-status").value = task.status;
        document.getElementById("task-completedAt").value = task.completedAt || "";
        setFormMode(true);
        toggleCompletedField();
    }

    // Handles task form submission
    function handleTaskSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const editingId = document.getElementById("task-id").value;
        const status = document.getElementById("task-status").value;

        const values = {
            title: document.getElementById("task-title").value,
            description: document.getElementById("task-description").value,
            assigneeId: document.getElementById("task-assigneeId").value,
            priority: document.getElementById("task-priority").value,
            deadline: document.getElementById("task-deadline").value,
            status: status,
            completedAt: status === "Completed" ? document.getElementById("task-completedAt").value : null
        };

        Cohere.UI.clearFieldErrors(form);

        const validation = Cohere.Validators.validateTask(values, editingId || null);
        if (!validation.valid) {
            Cohere.UI.showFieldErrors(form, validation.errors);
            return;
        }

        const result = editingId
            ? Cohere.Store.updateTask(editingId, values)
            : Cohere.Store.addTask(values);

        if (result.ok) {
            Cohere.UI.showToast(editingId ? "Task updated." : "Task added.", "success");
            resetTaskForm();
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Opens the form with a task's values for editing
    function startEditTask(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;
        if (!Cohere.Permissions.canUpdateTask(task)) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("manageTasks"), "error");
            return;
        }
        Cohere.Layout.openPanel("task-panel");
        fillForm(task);
        document.getElementById("task-title").focus();
    }

    // Moves a task to another status (the store re-checks permissions)
    function changeStatus(id, status, message) {
        const result = Cohere.Store.setTaskStatus(id, status, status === "Completed" ? Cohere.Utils.todayISO() : null);
        if (result.ok) {
            Cohere.UI.showToast(message, "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Kept for compatibility: completes an open task, reopens a completed one
    function quickToggleComplete(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;
        if (task.status === "Completed") changeStatus(id, "In Progress", "Task reopened.");
        else changeStatus(id, "Completed", "Task marked as completed.");
    }

    // Confirms and deletes a task
    function handleTaskDelete(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;
        if (!Cohere.Permissions.canUpdateTask(task)) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("manageTasks"), "error");
            return;
        }

        if (!Cohere.UI.confirmAction("Delete task \"" + task.title + "\"?")) return;

        const result = Cohere.Store.deleteTask(id);
        if (result.ok) {
            Cohere.UI.showToast("Task deleted.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Items for a row's "..." menu. Only built for people who may update this task.
    function menuItems(task) {
        if (!Cohere.Permissions.canUpdateTask(task)) return [];
        const id = task.id;
        const items = [{ icon: "edit", label: "Edit task", run: function () { startEditTask(id); } }];
        if (task.status === "Pending") {
            items.push({ icon: "arrow", label: "Start progress", run: function () { changeStatus(id, "In Progress", "Task is now in progress."); } });
        }
        if (task.status !== "Completed") {
            items.push({ icon: "check", label: "Mark as completed", run: function () { changeStatus(id, "Completed", "Task marked as completed."); } });
        }
        if (task.status === "In Progress") {
            items.push({ icon: "undo", label: "Move back to pending", run: function () { changeStatus(id, "Pending", "Task moved back to pending."); } });
        }
        if (task.status === "Completed") {
            items.push({ icon: "undo", label: "Reopen task", run: function () { changeStatus(id, "In Progress", "Task reopened."); } });
        }
        items.push({ sep: true });
        items.push({ icon: "trash", label: "Delete task", danger: true, run: function () { handleTaskDelete(id); } });
        return items;
    }

    // Resets the task form to "add" mode
    function resetTaskForm() {
        const form = document.getElementById("task-form");
        if (!form) return;
        form.reset();
        document.getElementById("task-id").value = "";
        setFormMode(false);
        applyDefaults();
        document.getElementById("task-completed-wrap").hidden = true;
        Cohere.UI.clearFieldErrors(form);
    }

    // ---- List helpers -------------------------------------------------------

    function matchesTab(task, tab) {
        if (tab === "all") return true;
        if (tab === "overdue") return Cohere.Services.isOverdue(task);
        return task.status === tab;
    }

    // Tasks after search, priority and assignee filters (the status tab is applied separately,
    // so each tab can show how many tasks it would hold)
    function baseFiltered() {
        const search = (document.getElementById("task-search").value || "").trim().toLowerCase();
        const filterPriority = document.getElementById("task-filter-priority").value;
        const filterAssignee = document.getElementById("task-filter-assignee").value;

        let tasks = Cohere.Store.visibleTasks();

        if (search) {
            tasks = tasks.filter(function (t) {
                const assignee = Cohere.Store.getMemberName(t.assigneeId).toLowerCase();
                return t.title.toLowerCase().includes(search) || assignee.includes(search);
            });
        }
        if (filterPriority) tasks = tasks.filter(function (t) { return t.priority === filterPriority; });
        if (filterAssignee) tasks = tasks.filter(function (t) { return t.assigneeId === filterAssignee; });
        return tasks;
    }

    function sortTasks(tasks) {
        const sortBy = document.getElementById("task-sort").value || "deadline-asc";
        const rank = { High: 0, Medium: 1, Low: 2 };
        return tasks.slice().sort(function (a, b) {
            if (sortBy === "deadline-asc") return (a.deadline || "").localeCompare(b.deadline || "");
            if (sortBy === "deadline-desc") return (b.deadline || "").localeCompare(a.deadline || "");
            if (sortBy === "title") return a.title.localeCompare(b.title);
            if (sortBy === "priority") return rank[a.priority] - rank[b.priority];
            return 0;
        });
    }

    function renderTabs(tasks) {
        const tabs = document.getElementById("task-tabs");
        if (!tabs) return;
        Cohere.Utils.clearEl(tabs);
        TABS.forEach(function (t) {
            const count = tasks.filter(function (task) { return matchesTab(task, t.value); }).length;
            const active = statusTab === t.value;
            const btn = Cohere.Utils.createEl("button", {
                type: "button",
                className: "task-tab" + (active ? " is-active" : "") + (t.value === "overdue" ? " is-overdue" : ""),
                "aria-pressed": active ? "true" : "false",
                dataset: { tab: t.value }
            }, [
                Cohere.Utils.createEl("span", { textContent: t.label }),
                Cohere.Utils.createEl("span", { className: "task-tab-count", textContent: String(count) })
            ]);
            tabs.appendChild(btn);
        });
    }

    function initials(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "?";
        return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }

    function daysUntil(iso) {
        const p = iso.split("-");
        const due = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        const t = Cohere.Utils.todayISO().split("-");
        const today = new Date(parseInt(t[0], 10), parseInt(t[1], 10) - 1, parseInt(t[2], 10));
        return Math.round((due - today) / 86400000);
    }

    // Short, human wording for a task's deadline state
    function dueInfo(task) {
        if (task.status === "Completed") {
            return task.completedAt ? { text: "Completed " + Cohere.Utils.formatDate(task.completedAt), kind: "done" } : null;
        }
        if (!task.deadline) return null;
        const d = daysUntil(task.deadline);
        if (d < 0) return { text: "Overdue by " + Math.abs(d) + (Math.abs(d) === 1 ? " day" : " days"), kind: "overdue" };
        if (d === 0) return { text: "Due today", kind: "soon" };
        if (d === 1) return { text: "Due tomorrow", kind: "soon" };
        if (d <= 7) return { text: "Due in " + d + " days", kind: "soon" };
        return null;
    }

    function cell(label, className) {
        return Cohere.Utils.createEl("td", { className: className || "", dataset: { label: label } });
    }

    function buildRow(t, isAdmin) {
        const U = Cohere.Utils;
        const done = t.status === "Completed";
        const overdue = Cohere.Services.isOverdue(t);

        const tr = U.createEl("tr", { className: "task-row" + (done ? " is-done" : "") + (overdue ? " is-overdue" : "") });

        // Task
        const titleTd = cell("Task", "task-cell-title");
        titleTd.appendChild(U.createEl("div", { className: "task-title", textContent: t.title }));
        if (t.description) titleTd.appendChild(U.createEl("div", { className: "task-desc", textContent: t.description }));
        tr.appendChild(titleTd);

        // Assigned to: name, then office / organization
        const member = Cohere.Store.getMember(t.assigneeId);
        const name = Cohere.Store.getMemberName(t.assigneeId);
        const subParts = [];
        if (member && member.position) subParts.push(member.position);
        if (isAdmin && member) {
            const org = Cohere.Store.getOrg(member.orgId);
            if (org) subParts.push(org.name);
        }
        const whoText = U.createEl("div", { className: "task-who-text" }, [
            U.createEl("div", { className: "task-who-name", textContent: name })
        ]);
        if (subParts.length) whoText.appendChild(U.createEl("div", { className: "task-who-sub", textContent: subParts.join(" · ") }));
        const whoTd = cell("Assigned to");
        whoTd.appendChild(U.createEl("div", { className: "task-who" }, [
            U.createEl("span", { className: "task-avatar", "aria-hidden": "true", textContent: initials(name) }),
            whoText
        ]));
        tr.appendChild(whoTd);

        // Priority
        const priTd = cell("Priority");
        priTd.appendChild(Cohere.UI.statusBadge(t.priority, t.priority.toLowerCase()));
        tr.appendChild(priTd);

        // Deadline + plain-words note
        const dueTd = cell("Deadline");
        dueTd.appendChild(U.createEl("div", { className: "task-date", textContent: U.formatDate(t.deadline) }));
        const info = dueInfo(t);
        if (info) dueTd.appendChild(U.createEl("div", { className: "task-due is-" + info.kind, textContent: info.text }));
        tr.appendChild(dueTd);

        // Status
        let statusKind = "pending";
        if (done) statusKind = "completed";
        else if (t.status === "In Progress") statusKind = "progress";
        const stTd = cell("Status");
        stTd.appendChild(Cohere.UI.statusBadge(t.status, statusKind));
        tr.appendChild(stTd);

        // "..." menu, only for people allowed to update this task
        const actionsTd = U.createEl("td", { className: "col-actions" });
        if (Cohere.Permissions.canUpdateTask(t)) {
            actionsTd.appendChild(U.createEl("button", {
                type: "button", className: "kebab-btn",
                "aria-label": "Actions for " + t.title, "aria-haspopup": "menu", "aria-expanded": "false",
                title: "Actions", dataset: { id: t.id }
            }, [Cohere.UI.icon("more")]));
        } else {
            actionsTd.textContent = "\u2014";
        }
        tr.appendChild(actionsTd);
        return tr;
    }

    function renderEmpty(list, hasAny) {
        const U = Cohere.Utils;
        const title = hasAny ? "No tasks match your filters" : "No tasks have been delegated yet";
        const hint = hasAny
            ? "Try a different status tab or clear the search."
            : (Cohere.Permissions.can("manageTasks") ? "Use Add Task to assign the first one." : "Tasks assigned in your organization will appear here.");
        const td = U.createEl("td", { colSpan: "6", className: "task-empty-cell" }, [
            U.createEl("div", { className: "task-empty" }, [
                Cohere.UI.icon("tasks"),
                U.createEl("strong", { textContent: title }),
                U.createEl("span", { textContent: hint })
            ])
        ]);
        list.appendChild(U.createEl("tr", { className: "task-empty-row" }, [td]));
    }

    // Renders the task register with search, filters, tabs and sort
    function renderTaskList() {
        const list = document.getElementById("task-list");
        if (!list) return;
        if (Cohere.Members && Cohere.Members.closeActionMenu) Cohere.Members.closeActionMenu(false);
        Cohere.Utils.clearEl(list);

        const base = baseFiltered();
        renderTabs(base);

        const tasks = sortTasks(base.filter(function (t) { return matchesTab(t, statusTab); }));

        if (tasks.length === 0) {
            renderEmpty(list, Cohere.Store.visibleTasks().length > 0);
            return;
        }

        const isAdmin = Cohere.Permissions.getActor().isAdmin;
        tasks.forEach(function (t) { list.appendChild(buildRow(t, isAdmin)); });
    }

    return {
        init,
        render,
        handleTaskSubmit,
        toggleCompletedField,
        renderTaskList,
        startEditTask,
        quickToggleComplete,
        handleTaskDelete
    };
})();
