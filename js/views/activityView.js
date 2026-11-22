window.Cohere = window.Cohere || {};
Cohere.ActivityView = (function () {
    "use strict";

    function init() {
        const search = document.getElementById("activity-search");
        if (search) search.addEventListener("input", render);

        const typeFilter = document.getElementById("activity-type-filter");
        if (typeFilter) {
            // Populate types only once
            if (typeFilter.options.length === 0) {
                const types = [
                    { value: "", label: "All types" },
                    { value: "member", label: "Member" },
                    { value: "organization", label: "Organization" },
                    { value: "task", label: "Task" },
                    { value: "appointment", label: "Appointment" },
                    { value: "attendance", label: "Attendance" },
                    { value: "system", label: "System" }
                ];
                Cohere.Utils.populateSelect(typeFilter, types, null);
            }
            typeFilter.addEventListener("change", render);
        }

        const clearBtn = document.getElementById("btn-clear-activity");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                if (Cohere.UI.confirmAction("Clear all activity logs? This cannot be undone.")) {
                    const result = Cohere.Activity.clear();
                    if (result.ok) {
                        Cohere.UI.showToast("Activity log cleared.", "success");
                        render();
                    } else {
                        Cohere.UI.showToast(result.error, "error");
                    }
                }
            });
        }
    }

    function render() {
        const list = document.getElementById("activity-list");
        if (!list) return;
        Cohere.Utils.clearEl(list);

        const searchEl = document.getElementById("activity-search");
        const search = searchEl ? searchEl.value.toLowerCase() : "";

        const typeFilterEl = document.getElementById("activity-type-filter");
        const typeFilter = typeFilterEl ? typeFilterEl.value : "";

        const filters = {};
        if (typeFilter) filters.type = typeFilter;
        if (search) filters.search = search;

        const entries = Cohere.Activity.getAll(filters);

        if (entries.length === 0) {
            list.appendChild(Cohere.Utils.createEl("li", {
                textContent: "No activity found.",
                className: "text-muted",
                style: "padding: 8px 0;"
            }));
            return;
        }

        entries.forEach(function (entry) {
            const li = Cohere.Utils.createEl("li", { style: "padding: 8px 0; border-bottom: 1px solid var(--color-border);" });

            const msgDiv = Cohere.Utils.createEl("div", { textContent: entry.message });
            li.appendChild(msgDiv);

            const metaDiv = Cohere.Utils.createEl("div", {
                className: "text-muted",
                style: "font-size: 0.875rem; margin-top: 4px;"
            });
            metaDiv.appendChild(document.createTextNode("by " + entry.actorName + " • " + Cohere.Utils.formatDateTime(entry.timestamp)));
            li.appendChild(metaDiv);

            list.appendChild(li);
        });
    }

    return { init, render };
})();