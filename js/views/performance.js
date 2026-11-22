window.Cohere = window.Cohere || {};
Cohere.Performance = (function () {
    "use strict";

    let currentSortKey = "overallScore";
    let currentSortDir = "desc";

    // Initializes the performance view (attach listeners once)
    function init() {
        const orgFilter = document.getElementById("perf-org-filter");
        if (orgFilter) {
            orgFilter.addEventListener("change", render);
        }

        const tableBody = document.getElementById("perf-table-body");
        if (tableBody) {
            // Row click for detail (E29)
            tableBody.addEventListener("click", function (e) {
                const row = e.target.closest("tr[data-member-id]");
                if (row) {
                    showDetail(row.dataset.memberId);
                }
            });

            // Header click for sorting (E30)
            // Attach to parent table to catch clicks on th elements
            const table = tableBody.parentElement;
            if (table) {
                table.addEventListener("click", function (e) {
                    const th = e.target.closest("th[data-sort]");
                    if (th) {
                        sortBy(th.dataset.sort);
                    }
                });
            }
        }
    }

    // Renders the entire performance view
    function render() {
        renderOrgFilter();
        renderTable();

        // Keep detail panel if a member is selected, or show prompt
        const detailPanel = document.getElementById("perf-detail");
        if (detailPanel && !detailPanel.dataset.memberId) {
            Cohere.Utils.clearEl(detailPanel);
            detailPanel.appendChild(Cohere.Utils.createEl("p", {
                textContent: "Click on an officer's row to view detailed performance metrics.",
                className: "text-muted"
            }));
        }
    }

    // Populates the organization filter dropdown
    function renderOrgFilter() {
        const orgFilter = document.getElementById("perf-org-filter");
        if (!orgFilter) return;

        const currentVal = orgFilter.value;
        const items = [{ value: "", label: "All organizations" }];
        window.Cohere.state.organizations.forEach(function (org) {
            items.push({ value: org.id, label: org.name });
        });
        Cohere.Utils.populateSelect(orgFilter, items, null);
        orgFilter.value = currentVal;
    }

    // Renders the performance table
    function renderTable() {
        const tbody = document.getElementById("perf-table-body");
        if (!tbody) return;
        Cohere.Utils.clearEl(tbody);

        const orgFilter = document.getElementById("perf-org-filter");
        const orgId = orgFilter ? orgFilter.value : "";

        // Get stats and apply current sort
        let stats = Cohere.Services.getAllStats(orgId);
        stats.sort(function (a, b) {
            let valA = a[currentSortKey];
            let valB = b[currentSortKey];

            // Handle nulls (push to bottom)
            if (valA === null && valB === null) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;

            if (typeof valA === "string") {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            let cmp = 0;
            if (valA < valB) cmp = -1;
            else if (valA > valB) cmp = 1;

            return currentSortDir === "desc" ? -cmp : cmp;
        });

        if (stats.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "No officers found.",
                colSpan: "5",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        stats.forEach(function (s) {
            const tr = Cohere.Utils.createEl("tr", { dataset: { memberId: s.memberId }, style: "cursor: pointer;" });

            tr.appendChild(Cohere.Utils.createEl("td", { textContent: s.fullName + " (" + s.position + ")" }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.taskCompletionRate) }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.onTimeRate) }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.attendanceRate) }));

            const scoreTd = Cohere.Utils.createEl("td");
            scoreTd.appendChild(Cohere.Utils.createEl("div", { textContent: Cohere.Utils.formatPercent(s.overallScore), style: "font-weight: 600;" }));
            scoreTd.appendChild(Cohere.Utils.createEl("small", { textContent: s.rating, className: "text-muted" }));
            tr.appendChild(scoreTd);

            tbody.appendChild(tr);
        });
    }

    // Handles sorting when a column header is clicked (E30)
    function sortBy(key) {
        if (currentSortKey === key) {
            currentSortDir = currentSortDir === "desc" ? "asc" : "desc";
        } else {
            currentSortKey = key;
            currentSortDir = "desc"; // Default to descending for new sorts
        }
        renderTable();
    }

    // Shows the detail panel for a specific officer (E29)
    function showDetail(memberId) {
        const detailPanel = document.getElementById("perf-detail");
        if (!detailPanel) return;
        detailPanel.dataset.memberId = memberId;
        Cohere.Utils.clearEl(detailPanel);

        const orgFilter = document.getElementById("perf-org-filter");
        const orgId = orgFilter ? orgFilter.value : "";
        const stats = Cohere.Services.getAllStats(orgId).find(function (s) { return s.memberId === memberId; });

        if (!stats) {
            detailPanel.appendChild(Cohere.Utils.createEl("p", { textContent: "Officer not found.", className: "text-muted" }));
            return;
        }

        const card = Cohere.Utils.createEl("div", { className: "card" });
        card.appendChild(Cohere.Utils.createEl("h3", { textContent: stats.fullName + " — " + stats.position, style: "margin-bottom: 16px;" }));

        const metrics = [
            { label: "Task Completion", rate: stats.taskCompletionRate, detail: stats.completed + " / " + stats.assigned + " tasks" },
            { label: "On-Time Completion", rate: stats.onTimeRate, detail: stats.completedOnTime + " / " + stats.completed + " completed on time" },
            { label: "Attendance Rate", rate: stats.attendanceRate, detail: stats.present + " present, " + stats.absent + " absent, " + stats.excused + " excused" },
            { label: "Overall Score", rate: stats.overallScore, detail: "Rating: " + stats.rating }
        ];

        metrics.forEach(function (m) {
            const row = Cohere.Utils.createEl("div", { style: "margin-bottom: 12px;" });

            const header = Cohere.Utils.createEl("div", { style: "display: flex; justify-content: space-between; margin-bottom: 4px;" });
            header.appendChild(Cohere.Utils.createEl("span", { textContent: m.label, style: "font-weight: 500;" }));
            header.appendChild(Cohere.Utils.createEl("span", { textContent: Cohere.Utils.formatPercent(m.rate), style: "font-weight: 600;" }));
            row.appendChild(header);

            const barTrack = Cohere.Utils.createEl("div", { className: "bar", style: "height: 12px; margin-bottom: 4px;" });
            const barFill = Cohere.Utils.createEl("div", {
                className: "bar-fill",
                style: "width: " + (m.rate !== null ? m.rate : 0) + "%; background: var(--color-primary);"
            });
            barTrack.appendChild(barFill);
            row.appendChild(barTrack);

            row.appendChild(Cohere.Utils.createEl("small", { textContent: m.detail, className: "text-muted" }));
            card.appendChild(row);
        });

        detailPanel.appendChild(card);
    }

    return { init, render, renderTable, sortBy, showDetail };
})();