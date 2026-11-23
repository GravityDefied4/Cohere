window.Cohere = window.Cohere || {};
Cohere.Performance = (function () {
    "use strict";

    // Module state (not persisted)
    let sortKey = "overallScore";
    let sortDir = "desc";
    let selectedMemberId = null;

    // Initializes the performance view (attach listeners once)
    function init() {
        // Org filter dropdown
        const orgFilter = document.getElementById("perf-org-filter");
        if (orgFilter) {
            orgFilter.addEventListener("change", renderTable);
        }

        // Sortable header clicks
        const tbody = document.getElementById("perf-table-body");
        const table = tbody ? tbody.closest("table") : null;
        if (table) {
            table.querySelectorAll("thead th[data-sort]").forEach(function (th) {
                th.style.cursor = "pointer";
                th.addEventListener("click", function () {
                    const key = th.getAttribute("data-sort");
                    if (sortKey === key) {
                        sortDir = sortDir === "asc" ? "desc" : "asc";
                    } else {
                        sortKey = key;
                        sortDir = key === "name" ? "asc" : "desc";
                    }
                    renderTable();
                });
            });
        }

        // Row click -> detail panel (delegated)
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const row = e.target.closest("tr[data-member-id]");
                if (!row) return;
                const id = row.getAttribute("data-member-id");
                selectedMemberId = id;
                renderDetail();
                // Highlight selected row
                tbody.querySelectorAll("tr").forEach(function (tr) {
                    tr.style.fontWeight = tr.getAttribute("data-member-id") === id ? "600" : "";
                });
            });
        }
    }

    // Renders the entire performance view
    function render() {
        renderOrgFilter();
        renderTable();
        renderDetail();
    }

    // Populates the organization filter dropdown
    function renderOrgFilter() {
        const select = document.getElementById("perf-org-filter");
        if (!select) return;

        const orgs = window.Cohere.state.organizations.map(function (o) {
            return { value: o.id, label: o.name };
        });

        const current = select.value;
        Cohere.Utils.populateSelect(select, orgs, "All organizations");
        // Restore selection if still valid
        if (current && select.querySelector('option[value="' + current + '"]')) {
            select.value = current;
        } else {
            select.value = "";
        }
    }

    // Returns stats for all officers, filtered by the org dropdown
    function getStatsForView() {
        const orgFilter = document.getElementById("perf-org-filter");
        const orgId = orgFilter ? orgFilter.value : "";
        return Cohere.Services.getAllStats(orgId || null);
    }

    // Applies the current sort to a copy of the stats array
    function applySort(stats) {
        const out = stats.slice();
        out.sort(function (a, b) {
            let av, bv;
            if (sortKey === "name") {
                av = (a.fullName || "").toLowerCase();
                bv = (b.fullName || "").toLowerCase();
            } else {
                av = a[sortKey];
                bv = b[sortKey];
            }
            // Nulls always sort to the bottom regardless of direction
            const aNull = av === null || av === undefined;
            const bNull = bv === null || bv === undefined;
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;

            let cmp;
            if (typeof av === "string") cmp = av.localeCompare(bv);
            else cmp = av - bv;
            return sortDir === "asc" ? cmp : -cmp;
        });
        return out;
    }

    // Renders the performance table
    function renderTable() {
        const tbody = document.getElementById("perf-table-body");
        if (!tbody) return;

        Cohere.Utils.clearEl(tbody);

        const stats = applySort(getStatsForView());

        if (stats.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "No officers to display.",
                colSpan: "5",
                className: "text-muted"
            }));
            tbody.appendChild(tr);
            return;
        }

        stats.forEach(function (s) {
            const tr = Cohere.Utils.createEl("tr", { dataset: { memberId: s.memberId } });
            tr.style.cursor = "pointer";

            tr.appendChild(Cohere.Utils.createEl("td", { textContent: s.fullName }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.taskCompletionRate) }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.onTimeRate) }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.attendanceRate) }));
            tr.appendChild(Cohere.Utils.createEl("td", { textContent: Cohere.Utils.formatPercent(s.overallScore) }));

            if (s.memberId === selectedMemberId) tr.style.fontWeight = "600";
            tbody.appendChild(tr);
        });
    }

    // Renders the detail panel for the selected officer (with bars)
    function renderDetail() {
        if (!selectedMemberId) {
            return;
        }

        const stats = Cohere.Services.getOfficerStats(selectedMemberId);
        if (!stats) {
            return;
        }

        const detail = Cohere.Utils.createEl("div", { className: "perf-detail-content" });

        const org = Cohere.Store.getOrg(stats.orgId);
        detail.appendChild(Cohere.Utils.createEl("p", {
            textContent: "Organization: " + (org ? org.name : "Unknown") + " · Rating: " + stats.rating,
            className: "text-muted"
        }));

        // Bars
        detail.appendChild(buildBarRow("Task completion", stats.taskCompletionRate, "Completed " + stats.completed + " of " + stats.assigned + " assigned"));
        detail.appendChild(buildBarRow("On-time rate", stats.onTimeRate, stats.completedOnTime + " of " + stats.completed + " completed on time"));
        detail.appendChild(buildBarRow("Attendance rate", stats.attendanceRate, stats.present + " present, " + stats.absent + " absent, " + stats.excused + " excused"));

        // Overall
        detail.appendChild(buildBarRow("Overall score", stats.overallScore, "Weighted average of the rates above"));

        // Task breakdown counts
        const counts = Cohere.Utils.createEl("p", {
            textContent:
                "Tasks: " + stats.assigned + " assigned · " +
                stats.completed + " completed · " +
                stats.overdue + " overdue",
            className: "text-muted"
        });
        detail.appendChild(counts);

        Cohere.UI.openModal(stats.fullName + " — " + stats.position, detail);
    }

    // Builds one bar row: label, bar, percent text, and an optional caption
    function buildBarRow(label, value, caption) {
        const wrap = Cohere.Utils.createEl("div", { style: "margin-bottom: 12px;" });

        const labelEl = Cohere.Utils.createEl("div", {
            textContent: label + ": " + Cohere.Utils.formatPercent(value),
            style: "font-weight: 500; margin-bottom: 4px;"
        });
        wrap.appendChild(labelEl);

        const bar = Cohere.Utils.createEl("div", { className: "bar" });
        const fill = Cohere.Utils.createEl("div", { className: "bar-fill" });
        const pct = (value === null || value === undefined) ? 0 : Math.max(0, Math.min(100, value));
        fill.style.width = pct + "%";
        bar.appendChild(fill);
        wrap.appendChild(bar);

        if (caption) {
            wrap.appendChild(Cohere.Utils.createEl("div", {
                textContent: caption,
                className: "text-muted",
                style: "font-size: 0.75rem; margin-top: 4px;"
            }));
        }

        return wrap;
    }

    return { init, render };
})();