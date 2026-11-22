window.Cohere = window.Cohere || {};

// Activity log module
Cohere.Activity = (function () {
    "use strict";

    // Logs an activity entry
    function log(type, message) {
        const actor = Cohere.Permissions.getActor();
        const entry = {
            id: Cohere.Utils.generateId("act"),
            type: type,
            message: message,
            actorId: actor.id,
            actorName: actor.name,
            timestamp: new Date().toISOString()
        };

        window.Cohere.state.activity.unshift(entry);

        // Keep only the latest MAX_ACTIVITY entries
        if (window.Cohere.state.activity.length > Cohere.Config.MAX_ACTIVITY) {
            window.Cohere.state.activity = window.Cohere.state.activity.slice(0, Cohere.Config.MAX_ACTIVITY);
        }

        Cohere.Storage.saveAll();
    }

    // Returns all activity entries, optionally filtered
    function getAll(filters) {
        let entries = window.Cohere.state.activity;

        if (filters) {
            if (filters.type) {
                entries = entries.filter(function (e) { return e.type === filters.type; });
            }
            if (filters.search) {
                const search = filters.search.toLowerCase();
                entries = entries.filter(function (e) {
                    return e.message.toLowerCase().includes(search) ||
                        e.actorName.toLowerCase().includes(search);
                });
            }
        }

        return entries;
    }

    // Clears all activity entries
    function clear() {
        if (!Cohere.Permissions.can("manageData")) {
            return { ok: false, error: Cohere.Permissions.denyMessage("manageData") };
        }

        window.Cohere.state.activity = [];
        Cohere.Storage.saveAll();

        return { ok: true };
    }

    return { log, getAll, clear };
})();

// Notifications module (stub for M1, will be filled in M7)
Cohere.Notify = (function () {
    "use strict";

    // Adds a notification (stub for M1)
    function add(type, message, memberId, refId) {
        const notification = {
            id: Cohere.Utils.generateId("notif"),
            message: message,
            type: type,
            memberId: memberId || null,
            refId: refId || null,
            read: false,
            timestamp: new Date().toISOString()
        };

        window.Cohere.state.notifications.unshift(notification);

        // Keep only the latest MAX_NOTIFICATIONS
        if (window.Cohere.state.notifications.length > Cohere.Config.MAX_NOTIFICATIONS) {
            window.Cohere.state.notifications = window.Cohere.state.notifications.slice(0, Cohere.Config.MAX_NOTIFICATIONS);
        }

        Cohere.Storage.saveAll();
    }

    // Returns notifications visible to the current profile
    function getVisible() {
        const actor = Cohere.Permissions.getActor();
        if (actor.isAdmin) {
            return window.Cohere.state.notifications;
        }
        return window.Cohere.state.notifications.filter(function (n) {
            return n.memberId === actor.id || n.memberId === null;
        });
    }

    // Returns unread count for current profile
    function getUnreadCount() {
        return getVisible().filter(function (n) { return !n.read; }).length;
    }

    // Marks a notification as read
    function markRead(id) {
        const notif = window.Cohere.state.notifications.find(function (n) { return n.id === id; });
        if (notif) {
            notif.read = true;
            Cohere.Storage.saveAll();
        }
    }

    // Marks all visible notifications as read
    function markAllRead() {
        getVisible().forEach(function (n) { n.read = true; });
        Cohere.Storage.saveAll();
    }

    // Toggles the notification panel
    function togglePanel() {
        const panel = document.getElementById("notif-panel");
        if (panel) {
            panel.hidden = !panel.hidden;
            if (!panel.hidden) renderPanel();
        }
    }

    const TYPE_ICONS = { task: "tasks", meeting: "cal", deadline: "clock" };

    // Renders the notification panel
    function renderPanel() {
        const panel = document.getElementById("notif-panel");
        const list = document.getElementById("notif-list");
        const badge = document.getElementById("notif-badge");
        const count = document.getElementById("notif-count");
        const markAll = document.getElementById("btn-mark-all-read");

        if (!panel || !list || !badge) return;

        const notifications = getVisible();
        const unread = notifications.filter(function (n) { return !n.read; }).length;

        if (unread > 0) {
            badge.textContent = unread;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
        if (count) {
            count.textContent = unread + " new";
            count.hidden = unread === 0;
        }
        if (markAll) markAll.disabled = unread === 0;

        Cohere.Utils.clearEl(list);

        if (notifications.length === 0) {
            const empty = Cohere.Utils.createEl("li", { className: "notif-empty" }, [
                Cohere.Utils.createEl("span", { className: "notif-ico" }, [Cohere.UI.icon("bell")]),
                Cohere.Utils.createEl("span", { textContent: "No notifications yet." })
            ]);
            list.appendChild(empty);
            return;
        }

        notifications.forEach(function (n) {
            const li = Cohere.Utils.createEl("li", {
                className: "notif-item" + (n.read ? "" : " is-unread"),
                dataset: { id: n.id },
                tabindex: "0",
                role: "button"
            });

            const ico = Cohere.Utils.createEl("span", { className: "notif-ico" }, [
                Cohere.UI.icon(TYPE_ICONS[n.type] || "bell")
            ]);
            const body = Cohere.Utils.createEl("div", { className: "notif-body" }, [
                Cohere.Utils.createEl("div", { className: "notif-msg", textContent: n.message }),
                Cohere.Utils.createEl("small", {
                    className: "notif-time",
                    textContent: Cohere.Utils.formatDateTime(n.timestamp)
                })
            ]);

            li.appendChild(ico);
            li.appendChild(body);
            if (!n.read) {
                li.appendChild(Cohere.Utils.createEl("span", { className: "notif-dot", "aria-label": "Unread" }));
            }
            list.appendChild(li);
        });
    }

    function init() {
        // E05: Click one notification
        const list = document.getElementById("notif-list");
        if (list) {
            list.addEventListener("click", function (e) {
                const li = e.target.closest("li[data-id]");
                if (li) {
                    markRead(li.dataset.id);
                    renderPanel();
                }
            });
            list.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                const li = e.target.closest("li[data-id]");
                if (li) {
                    e.preventDefault();
                    markRead(li.dataset.id);
                    renderPanel();
                    const again = list.querySelector('li[data-id="' + li.dataset.id + '"]');
                    if (again) again.focus();
                }
            });
        }

        // E06: Click "Mark all read"
        const markAllBtn = document.getElementById("btn-mark-all-read");
        if (markAllBtn) {
            markAllBtn.addEventListener("click", function () {
                markAllRead();
                renderPanel();
            });
        }

        // E04: Click the bell
        const bellBtn = document.getElementById("btn-notifications");
        if (bellBtn) {
            bellBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                togglePanel();
            });
        }

        // E37: Close panel when clicking outside
        document.addEventListener("click", function (e) {
            const panel = document.getElementById("notif-panel");
            const bell = document.getElementById("btn-notifications");
            if (panel && !panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) {
                panel.hidden = true;
            }
        });
    }

    return { add, getVisible, getUnreadCount, markRead, markAllRead, togglePanel, renderPanel, init };

})();