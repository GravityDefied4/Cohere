window.Cohere = window.Cohere || {};
Cohere.Tasks = (function () {
    "use strict";

    // Initializes the tasks view (attach listeners once)
    function init() {
        // Task form submit (E14)
        const form = document.getElementById("task-form");
        if (form) form.addEventListener("submit", handleTaskSubmit);

        const cancel = document.getElementById("task-cancel");
        if (cancel) cancel.addEventListener("click", resetTaskForm);

        // Status change reveals/hides the completion field (E15)
        const statusSelect = document.getElementById("task-status");
        if (statusSelect) statusSelect.addEventListener("change", toggleCompletedField);

        // Live search (E16) and filters/sort (E17)
        const search = document.getElementById("task-search");
        if (search) search.addEventListener("input", renderTaskList);

        ["task-filter-status", "task-filter-priority", "task-filter-assignee", "task-sort"].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", renderTaskList);
        });

        // Delegated actions on the task table (E18, E19, E20)
        const tbody = document.getElementById("task-list");
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-action]");
                if (!btn) return;
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (action === "edit") startEditTask(id);
                else if (action === "toggle") quickToggleComplete(id);
                else if (action === "delete") handleTaskDelete(id);
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
            const members = window.Cohere.state.members.map(function (m) {
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
            if (task) {
                document.getElementById("task-title").value = task.title;
                document.getElementById("task-description").value = task.description || "";
                document.getElementById("task-assigneeId").value = task.assigneeId;
                document.getElementById("task-priority").value = task.priority;
                document.getElementById("task-deadline").value = task.deadline;
                document.getElementById("task-status").value = task.status;
                document.getElementById("task-completedAt").value = task.completedAt || "";
                document.getElementById("task-submit").textContent = "Update Task";
                document.getElementById("task-cancel").hidden = false;
                toggleCompletedField();
            }
        }
    }

    // Populates the filter and sort dropdowns
    function renderTaskFilterDropdowns() {
        const statusFilter = document.getElementById("task-filter-status");
        if (statusFilter) {
            const items = [{ value: "", label: "All statuses" }].concat(
                Cohere.Config.TASK_STATUSES.map(function (s) { return { value: s, label: s }; })
            );
            const current = statusFilter.value;
            Cohere.Utils.populateSelect(statusFilter, items, null);
            statusFilter.value = current;
        }

        const priorityFilter = document.getElementById("task-filter-priority");
        if (priorityFilter) {
            const items = [{ value: "", label: "All priorities" }].concat(
                Cohere.Config.PRIORITIES.map(function (p) { return { value: p, label: p }; })
            );
            const current = priorityFilter.value;
            Cohere.Utils.populateSelect(priorityFilter, items, null);
            priorityFilter.value = current;
        }

        const assigneeFilter = document.getElementById("task-filter-assignee");
        if (assigneeFilter) {
            const members = window.Cohere.state.members.map(function (m) {
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
                { value: "priority", label: "Priority (High→Low)" },
                { value: "title", label: "Title (A→Z)" }
            ];
            const current = sortSelect.value || "deadline-asc";
            Cohere.Utils.populateSelect(sortSelect, items, null);
            sortSelect.value = current;
        }
    }

    // Shows the completion date field only when status is Completed (E15)
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

    // Handles task form submission (E14)
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

        const validation = Cohere.Validators.validateTask(values);
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

    // Fills the form with a task's values for editing (E18)
    function startEditTask(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;

        document.getElementById("task-id").value = task.id;
        document.getElementById("task-title").value = task.title;
        document.getElementById("task-description").value = task.description || "";
        document.getElementById("task-assigneeId").value = task.assigneeId;
        document.getElementById("task-priority").value = task.priority;
        document.getElementById("task-deadline").value = task.deadline;
        document.getElementById("task-status").value = task.status;
        document.getElementById("task-completedAt").value = task.completedAt || "";
        document.getElementById("task-submit").textContent = "Update Task";
        document.getElementById("task-cancel").hidden = false;

        toggleCompletedField();
        document.getElementById("task-title").focus();
    }

    // Quick toggles Completed/reopen using today's date (E19)
    function quickToggleComplete(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;

        const result = task.status === "Completed"
            ? Cohere.Store.setTaskStatus(id, "Pending", null)
            : Cohere.Store.setTaskStatus(id, "Completed", Cohere.Utils.todayISO());

        if (result.ok) {
            Cohere.UI.showToast(
                task.status === "Completed" ? "Task completed." : "Task reopened.",
                "success"
            );
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Confirms and deletes a task (E20)
    function handleTaskDelete(id) {
        const task = Cohere.Store.getTask(id);
        if (!task) return;

        if (!Cohere.UI.confirmAction("Delete task \"" + task.title + "\"?")) return;

        const result = Cohere.Store.deleteTask(id);
        if (result.ok) {
            Cohere.UI.showToast("Task deleted.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    // Resets the task form to "add" mode
    function resetTaskForm() {
        const form = document.getElementById("task-form");
        if (!form) return;
        form.reset();
        document.getElementById("task-id").value = "";
        document.getElementById("task-submit").textContent = "Add Task";
        document.getElementById("task-cancel").hidden = true;
        document.getElementById("task-completed-wrap").hidden = true;
        Cohere.UI.clearFieldErrors(form);
    }

    // Renders the task table with search, filters, and sort (E16, E17)
    function renderTaskList() {
        const tbody = document.getElementById("task-list");
        if (!tbody) return;

        Cohere.Utils.clearEl(tbody);

        const search = (document.getElementById("task-search").value || "").toLowerCase();
        const filterStatus = document.getElementById("task-filter-status").value;
        const filterPriority = document.getElementById("task-filter-priority").value;
        const filterAssignee = document.getElementById("task-filter-assignee").value;
        const sortBy = document.getElementById("task-sort").value || "deadline-asc";

        let tasks = window.Cohere.state.tasks.slice();

        // Filter by title or assignee name (E16)
        if (search) {
            tasks = tasks.filter(function (t) {
                const assignee = Cohere.Store.getMemberName(t.assigneeId).toLowerCase();
                return t.title.toLowerCase().includes(search) || assignee.includes(search);
            });
        }

        // Filter by status, priority, assignee (E17)
        if (filterStatus) tasks = tasks.filter(function (t) { return t.status === filterStatus; });
        if (filterPriority) tasks = tasks.filter(function (t) { return t.priority === filterPriority; });
        if (filterAssignee) tasks = tasks.filter(function (t) { return t.assigneeId === filterAssignee; });

        // Sort (E17)
        tasks.sort(function (a, b) {
            if (sortBy === "deadline-asc") return (a.deadline || "").localeCompare(b.deadline || "");
            if (sortBy === "deadline-desc") return (b.deadline || "").localeCompare(a.deadline || "");
            if (sortBy === "title") return a.title.localeCompare(b.title);
            if (sortBy === "priority") {
                const rank = { High: 0, Medium: 1, Low: 2 };
                return rank[a.priority] - rank[b.priority];
            }
            return 0;
        });

        if (tasks.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "No tasks found.",
                colSpan: "6",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        tasks.forEach(function (t) {
            const tr = Cohere.Utils.createEl("tr");
            if (Cohere.Services.isOverdue(t)) tr.classList.add("row-overdue");

            tr.appendChild(Cohere.Utils.createEl("td", { textContent: t.title }));

            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: Cohere.Store.getMemberName(t.assigneeId)
            }));

            const priorityTd = Cohere.Utils.createEl("td");
            priorityTd.appendChild(Cohere.UI.statusBadge(t.priority, t.priority.toLowerCase()));
            tr.appendChild(priorityTd);

            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatDate(t.deadline) }));

            const statusTd = Cohere.Utils.createEl("td");
            let statusKind = "pending";
            if (t.status === "Completed") statusKind = "completed";
            else if (t.status === "In Progress") statusKind = "progress";
            statusTd.appendChild(Cohere.UI.statusBadge(t.status, statusKind));
            tr.appendChild(statusTd);

            const actionsTd = Cohere.Utils.createEl("td");

            if (Cohere.Permissions.can("manageTasks")) {
                const editBtn = Cohere.Utils.createEl("button", {
                    textContent: "Edit",
                    className: "btn btn-secondary",
                    dataset: { action: "edit", id: t.id }
                });

                const toggleLabel = t.status === "Completed" ? "Reopen" : "Complete";
                const toggleBtn = Cohere.Utils.createEl("button", {
                    textContent: toggleLabel,
                    className: "btn",
                    dataset: { action: "toggle", id: t.id },
                    style: "margin-left: 4px;"
                });

                const deleteBtn = Cohere.Utils.createEl("button", {
                    textContent: "Delete",
                    className: "btn btn-danger",
                    dataset: { action: "delete", id: t.id },
                    style: "margin-left: 4px;"
                });

                actionsTd.appendChild(editBtn);
                actionsTd.appendChild(toggleBtn);
                actionsTd.appendChild(deleteBtn);
            } else {
                actionsTd.textContent = "—";
            }

            tr.appendChild(actionsTd);
            tbody.appendChild(tr);
        });
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