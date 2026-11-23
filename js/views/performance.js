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

        updateSortHeaders();

        // Row click -> detail panel (delegated)
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const row = e.target.closest("tr[data-member-id]");
                if (!row) return;
                const id = row.getAttribute("data-member-id");
                selectedMemberId = id;
                renderDetail();
                updateSelectedRow();
            });
            tbody.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                const row = e.target.closest("tr[data-member-id]");
                if (!row) return;
                e.preventDefault();
                selectedMemberId = row.getAttribute("data-member-id");
                renderDetail();
                updateSelectedRow();
            });
        }
    }

    function updateSortHeaders() {
        const table = document.querySelector("#view-performance table");
        if (!table) return;
        table.querySelectorAll("thead th[data-sort]").forEach(function (th) {
            const key = th.getAttribute("data-sort");
            th.classList.toggle("is-sorted", key === sortKey);
            th.setAttribute("aria-sort", key === sortKey
                ? (sortDir === "asc" ? "ascending" : "descending")
                : "none");
        });
    }

    function updateSelectedRow() {
        const tbody = document.getElementById("perf-table-body");
        if (!tbody) return;
        tbody.querySelectorAll("tr[data-member-id]").forEach(function (tr) {
            const active = tr.getAttribute("data-member-id") === selectedMemberId;
            tr.classList.toggle("is-active", active);
            tr.setAttribute("aria-selected", active ? "true" : "false");
        });
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
        const rankByMemberId = new Map();
        stats.filter(function (s) {
            return s.overallScore !== null && s.overallScore !== undefined;
        }).slice().sort(function (a, b) {
            const scoreDifference = b.overallScore - a.overallScore;
            if (scoreDifference !== 0) return scoreDifference;
            return (a.fullName || "").localeCompare(b.fullName || "");
        }).forEach(function (s, index) {
            rankByMemberId.set(s.memberId, index + 1);
        });
        renderSummary(stats);
        updateSortHeaders();

        if (stats.length === 0) {
            const tr = Cohere.Utils.createEl("tr");
            tr.appendChild(Cohere.Utils.createEl("td", {
                textContent: "No officers to display.",
                colSpan: "5",
                className: "perf-empty"
            }));
            tbody.appendChild(tr);
            return;
        }

        stats.forEach(function (s) {
            const rank = rankByMemberId.get(s.memberId);
            const isTopFive = rank && rank <= 5;
            const tr = Cohere.Utils.createEl("tr", {
                dataset: { memberId: s.memberId },
                className: isTopFive ? "is-top-performer is-top-" + rank : "",
                tabindex: "0",
                "aria-label": (isTopFive ? "Rank " + rank + ". " : "") + "View performance for " + s.fullName
            });

            const nameCell = Cohere.Utils.createEl("td");
            const identity = Cohere.Utils.createEl("div", { className: "perf-person" });
            if (isTopFive) {
                identity.appendChild(Cohere.Utils.createEl("span", {
                    className: "perf-rank perf-rank-" + rank,
                    textContent: String(rank),
                    "aria-label": "Rank " + rank
                }));
            }
            const initials = (s.fullName || "?").split(/\s+/).map(function (part) {
                return part.charAt(0);
            }).slice(0, 2).join("").toUpperCase();
            identity.appendChild(Cohere.Utils.createEl("span", {
                className: "perf-avatar",
                textContent: initials,
                "aria-hidden": "true"
            }));
            const identityText = Cohere.Utils.createEl("div", { className: "perf-person-text" });
            identityText.appendChild(Cohere.Utils.createEl("strong", { textContent: s.fullName }));
            identityText.appendChild(Cohere.Utils.createEl("span", { textContent: s.position || "Officer" }));
            identity.appendChild(identityText);
            nameCell.appendChild(identity);
            tr.appendChild(nameCell);

            tr.appendChild(buildMetricCell(s.taskCompletionRate));
            tr.appendChild(buildMetricCell(s.onTimeRate));
            tr.appendChild(buildMetricCell(s.attendanceRate));

            const scoreCell = Cohere.Utils.createEl("td");
            const score = Cohere.Utils.createEl("span", {
                className: "perf-score " + getScoreClass(s.overallScore),
                textContent: Cohere.Utils.formatPercent(s.overallScore)
            });
            scoreCell.appendChild(score);
            tr.appendChild(scoreCell);

            tbody.appendChild(tr);
        });
        updateSelectedRow();
    }

    function buildMetricCell(value) {
        const td = Cohere.Utils.createEl("td", { className: "perf-metric" });
        const valueRow = Cohere.Utils.createEl("div", { className: "perf-metric-value" });
        valueRow.appendChild(Cohere.Utils.createEl("strong", {
            textContent: Cohere.Utils.formatPercent(value)
        }));
        td.appendChild(valueRow);
        if (value !== null && value !== undefined) {
            const track = Cohere.Utils.createEl("div", { className: "perf-mini-bar", "aria-hidden": "true" });
            const fill = Cohere.Utils.createEl("span", { className: "perf-mini-fill " + getScoreClass(value) });
            fill.style.width = Math.max(0, Math.min(100, value)) + "%";
            track.appendChild(fill);
            td.appendChild(track);
        }
        return td;
    }

    function getScoreClass(value) {
        if (value === null || value === undefined) return "score-none";
        if (value >= 90) return "score-excellent";
        if (value >= 75) return "score-good";
        if (value >= 50) return "score-fair";
        return "score-low";
    }

    function renderSummary(stats) {
        const scored = stats.filter(function (s) {
            return s.overallScore !== null && s.overallScore !== undefined;
        });
        const average = scored.length
            ? scored.reduce(function (sum, s) { return sum + s.overallScore; }, 0) / scored.length
            : null;
        const top = scored.length ? scored.slice().sort(function (a, b) {
            return b.overallScore - a.overallScore;
        })[0] : null;
        const needsAttention = scored.filter(function (s) { return s.overallScore < 50; }).length;

        document.getElementById("perf-stat-officers").textContent = stats.length;
        document.getElementById("perf-stat-average").textContent = Cohere.Utils.formatPercent(average);
        document.getElementById("perf-stat-top").textContent = top ? top.fullName : "N/A";
        document.getElementById("perf-stat-alert").textContent = needsAttention;
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
        const header = Cohere.Utils.createEl("div", { className: "perf-detail-header" });
        const initials = (stats.fullName || "?").split(/\s+/).map(function (part) {
            return part.charAt(0);
        }).slice(0, 2).join("").toUpperCase();
        const identity = Cohere.Utils.createEl("div", { className: "perf-detail-identity" });
        identity.appendChild(Cohere.Utils.createEl("span", {
            className: "perf-detail-avatar",
            textContent: initials,
            "aria-hidden": "true"
        }));
        const identityText = Cohere.Utils.createEl("div", { className: "perf-detail-identity-text" });
        identityText.appendChild(Cohere.Utils.createEl("strong", {
            textContent: stats.position || "Officer",
            className: "perf-detail-position"
        }));
        identityText.appendChild(Cohere.Utils.createEl("span", {
            textContent: org ? org.name : "Unknown organization",
            className: "perf-detail-org"
        }));
        identity.appendChild(identityText);
        header.appendChild(identity);
        const rating = Cohere.Utils.createEl("div", { className: "perf-rating-wrap" });
        rating.appendChild(Cohere.Utils.createEl("span", {
            textContent: "Overall rating",
            className: "perf-rating-label"
        }));
        rating.appendChild(Cohere.Utils.createEl("span", {
            textContent: stats.rating,
            className: "perf-rating " + getScoreClass(stats.overallScore)
        }));
        header.appendChild(rating);
        detail.appendChild(header);

        detail.appendChild(Cohere.Utils.createEl("h3", {
            textContent: "Performance snapshot",
            className: "perf-detail-section-title"
        }));
        const metrics = Cohere.Utils.createEl("div", { className: "perf-detail-grid" });
        metrics.appendChild(buildDetailMetric("Overall score", stats.overallScore));
        metrics.appendChild(buildDetailMetric("Task completion", stats.taskCompletionRate));
        metrics.appendChild(buildDetailMetric("On-time", stats.onTimeRate));
        metrics.appendChild(buildDetailMetric("Attendance", stats.attendanceRate));
        detail.appendChild(metrics);

        detail.appendChild(Cohere.Utils.createEl("h3", {
            textContent: "Rate breakdown",
            className: "perf-detail-section-title perf-breakdown-title"
        }));
        const breakdown = Cohere.Utils.createEl("div", { className: "perf-breakdown" });
        breakdown.appendChild(buildBarRow("Task completion", stats.taskCompletionRate, "Completed " + stats.completed + " of " + stats.assigned + " assigned"));
        breakdown.appendChild(buildBarRow("On-time rate", stats.onTimeRate, stats.completedOnTime + " of " + stats.completed + " completed on time"));
        breakdown.appendChild(buildBarRow("Attendance rate", stats.attendanceRate, stats.present + " present, " + stats.absent + " absent, " + stats.excused + " excused"));
        detail.appendChild(breakdown);

        Cohere.UI.openModal(stats.fullName, detail);
        const modal = document.getElementById("modal");
        if (modal) modal.classList.add("perf-modal");
    }

    function buildDetailMetric(label, value) {
        const card = Cohere.Utils.createEl("div", { className: "perf-detail-metric" });
        card.appendChild(Cohere.Utils.createEl("span", { textContent: label }));
        card.appendChild(Cohere.Utils.createEl("strong", {
            textContent: Cohere.Utils.formatPercent(value),
            className: getScoreClass(value)
        }));
        return card;
    }

    // Builds one bar row: label, bar, percent text, and an optional caption
    function buildBarRow(label, value, caption) {
        const wrap = Cohere.Utils.createEl("div", { className: "perf-bar-row" });

        const labelRow = Cohere.Utils.createEl("div", { className: "perf-bar-label" });
        labelRow.appendChild(Cohere.Utils.createEl("span", { textContent: label }));
        labelRow.appendChild(Cohere.Utils.createEl("strong", { textContent: Cohere.Utils.formatPercent(value) }));
        wrap.appendChild(labelRow);

        const bar = Cohere.Utils.createEl("div", { className: "bar" });
        const fill = Cohere.Utils.createEl("div", { className: "bar-fill" });
        const pct = (value === null || value === undefined) ? 0 : Math.max(0, Math.min(100, value));
        fill.style.width = pct + "%";
        bar.appendChild(fill);
        wrap.appendChild(bar);

        if (caption) {
            wrap.appendChild(Cohere.Utils.createEl("div", {
                textContent: caption,
                className: "perf-bar-caption"
            }));
        }

        return wrap;
    }

    return { init, render };
})();