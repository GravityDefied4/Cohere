window.Cohere = window.Cohere || {};
// Organization tab: org picker, Admin tools (create organizations, assign president),
// President tools (add members) and the members table.
Cohere.Members = (function () {
    "use strict";

    const $ = function (id) { return document.getElementById(id); };
    const el = function (tag, props, kids) { return Cohere.Utils.createEl(tag, props, kids); };
    let selectedOrgId = "";

    // Organizations the signed-in person may see: Admin sees all, others only their own
    function visibleOrgs() {
        const actor = Cohere.Permissions.getActor();
        const orgs = window.Cohere.state.organizations;
        if (actor.isAdmin) return orgs;
        return orgs.filter(function (o) { return o.id === actor.orgId; });
    }

    function ensureSelection() {
        const orgs = visibleOrgs();
        if (!orgs.some(function (o) { return o.id === selectedOrgId; })) {
            selectedOrgId = orgs.length ? orgs[0].id : "";
        }
    }

    function selectedOrg() { return Cohere.Store.getOrg(selectedOrgId); }

    function init() {
        // Org picker
        $("org-picker-btn").addEventListener("click", function () { togglePicker(); });
        $("org-picker-list").addEventListener("click", function (e) {
            const item = e.target.closest("[data-org]");
            if (!item) return;
            selectedOrgId = item.dataset.org;
            togglePicker(false);
            resetMemberForm();
            Cohere.Layout.closePanel("member-panel");
            Cohere.Layout.closePanel("president-panel");
            render();
        });
        document.addEventListener("click", function (e) {
            if (!e.target.closest("#org-picker")) togglePicker(false);
        });

        // Organization form (Admin)
        $("org-form").addEventListener("submit", handleOrgSubmit);
        $("org-cancel").addEventListener("click", resetOrgForm);
        $("org-detail").addEventListener("click", function (e) {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            if (btn.dataset.action === "edit") startEditOrg(btn.dataset.id);
            else if (btn.dataset.action === "delete") handleOrgDelete(btn.dataset.id);
            else if (btn.dataset.action === "assign") openPresidentForm();
        });
        $("president-form").addEventListener("submit", handlePresidentSubmit);

        // Member form + filters + table
        $("member-form").addEventListener("submit", handleMemberSubmit);
        $("member-cancel").addEventListener("click", resetMemberForm);
        $("btn-add-member").addEventListener("click", function () { resetMemberForm(); });
        $("member-search").addEventListener("input", renderMemberTable);
        $("member-filter-office").addEventListener("change", renderMemberTable);
        $("member-filter-status").addEventListener("change", renderMemberTable);
        $("member-table-body").addEventListener("click", function (e) {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === "edit") startEditMember(id);
            else if (btn.dataset.action === "delete") handleMemberDelete(id);
            else if (btn.dataset.action === "toggle") handleToggleStatus(id);
        });
    }

    function render() {
        ensureSelection();
        renderOrgPicker();
        renderOrgDetail();
        renderMemberForm();
        renderFilters();
        renderMemberTable();
        // Adding members needs an organization the person manages
        const addBtn = $("btn-add-member");
        if (addBtn && Cohere.Permissions.can("manageMembers")) {
            addBtn.hidden = !Cohere.Permissions.canManageOrgMembers(selectedOrgId);
        }
    }

    // ---- Org picker ---------------------------------------------------------
    function togglePicker(force) {
        const list = $("org-picker-list");
        const open = typeof force === "boolean" ? force : list.hidden;
        list.hidden = !open || list.children.length < 2;
        $("org-picker-btn").setAttribute("aria-expanded", String(!list.hidden));
        $("org-picker").classList.toggle("open", !list.hidden);
    }

    function renderOrgPicker() {
        const org = selectedOrg();
        const orgs = visibleOrgs();
        $("org-picker-name").textContent = org ? org.name : "No organization";
        $("org-picker-desc").textContent = org ? (org.description || "No description") :
            (Cohere.Permissions.can("manageOrgs") ? "Use “Add organization” to create one." : "You are not assigned to an organization yet.");
        $("org-picker").classList.toggle("single", orgs.length < 2);

        const list = $("org-picker-list");
        Cohere.Utils.clearEl(list);
        orgs.forEach(function (o) {
            const li = el("li", { dataset: { org: o.id }, tabindex: "0", className: o.id === selectedOrgId ? "is-selected" : "" });
            li.appendChild(el("span", { className: "org-orb", "aria-hidden": "true" }));
            li.appendChild(el("span", { className: "org-picker-text" }, [
                el("strong", { textContent: o.name }),
                el("span", { textContent: o.description || "No description" })
            ]));
            list.appendChild(li);
        });
        list.hidden = true;
        $("org-picker-btn").setAttribute("aria-expanded", "false");
        $("org-picker").classList.remove("open");
    }

    // ---- Admin: details of the selected organization -----------------------
    function renderOrgDetail() {
        const box = $("org-detail");
        if (!box) return;
        Cohere.Utils.clearEl(box);
        const org = selectedOrg();
        if (!org || !Cohere.Permissions.can("manageOrgs")) return;

        const pres = Cohere.Store.getPresident(org.id);
        const count = window.Cohere.state.members.filter(function (m) { return m.orgId === org.id; }).length;
        box.appendChild(el("p", { className: "org-detail-line" }, [
            el("strong", { textContent: "President: " }),
            pres ? pres.fullName + " (" + pres.studentId + ")" : "Not assigned yet",
            " · " + count + " member" + (count !== 1 ? "s" : "")
        ]));
        const actions = el("div", { className: "actions wrap" });
        actions.appendChild(el("button", { type: "button", className: "btn", textContent: pres ? "Change president" : "Assign president", dataset: { action: "assign", id: org.id } }));
        actions.appendChild(el("button", { type: "button", className: "btn btn-secondary", textContent: "Edit organization", dataset: { action: "edit", id: org.id } }));
        actions.appendChild(el("button", { type: "button", className: "btn btn-danger-o", textContent: "Delete organization", dataset: { action: "delete", id: org.id } }));
        box.appendChild(actions);
    }

    function openPresidentForm() {
        const org = selectedOrg();
        if (!org) return;
        const form = $("president-form");
        form.reset();
        Cohere.UI.clearFieldErrors(form);
        $("president-title").textContent = "Assign president · " + org.name;
        Cohere.Layout.openPanel("president-panel");
    }

    function handlePresidentSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const values = {
            fullName: $("pres-fullName").value,
            studentId: $("pres-studentId").value,
            email: $("pres-email").value
        };
        Cohere.UI.clearFieldErrors(form);
        const v = Cohere.Validators.validatePresident(values);
        if (!v.valid) { Cohere.UI.showFieldErrors(form, v.errors); return; }

        const result = Cohere.Store.assignPresident(selectedOrgId, values);
        if (!result.ok) { Cohere.UI.showToast(result.error, "error"); return; }
        form.reset();
        Cohere.UI.showToast(result.created
            ? "President assigned. Sign-in: " + result.account.studentId + " · first password: " + result.account.password
            : "President assigned.", "success");
        Cohere.App.renderAll();
    }

    // ---- Organization form (Admin) -----------------------------------------
    function handleOrgSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = $("org-id").value;
        const values = { name: $("org-name").value, description: $("org-desc").value };
        Cohere.UI.clearFieldErrors(form);

        const validation = Cohere.Validators.validateOrg(values, editingId || null);
        if (!validation.valid) { Cohere.UI.showFieldErrors(form, validation.errors); return; }

        const result = editingId ? Cohere.Store.updateOrg(editingId, values) : Cohere.Store.addOrg(values);
        if (!result.ok) { Cohere.UI.showToast(result.error, "error"); return; }
        if (!editingId) selectedOrgId = result.data.id;
        Cohere.UI.showToast(editingId ? "Organization updated." : "Organization added. Now assign its president.", "success");
        resetOrgForm();
        Cohere.App.renderAll();
    }

    function startEditOrg(id) {
        const org = Cohere.Store.getOrg(id);
        if (!org) return;
        $("org-id").value = org.id;
        $("org-name").value = org.name;
        $("org-desc").value = org.description;
        $("org-submit").textContent = "Update Organization";
        $("org-cancel").hidden = false;
        $("org-name").focus();
    }

    function handleOrgDelete(id) {
        const org = Cohere.Store.getOrg(id);
        if (!org) return;
        if (!Cohere.UI.confirmAction("Delete organization \"" + org.name + "\"?")) return;
        const result = Cohere.Store.deleteOrg(id);
        if (result.ok) {
            Cohere.UI.showToast("Organization deleted.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    function resetOrgForm() {
        const form = $("org-form");
        form.reset();
        $("org-id").value = "";
        $("org-submit").textContent = "Add Organization";
        $("org-cancel").hidden = true;
        Cohere.UI.clearFieldErrors(form);
    }

    // ---- Member form (President) --------------------------------------------
    function renderMemberForm() {
        const editingId = $("member-id").value;
        const editing = editingId ? Cohere.Store.getMember(editingId) : null;
        const roleSelect = $("member-role");

        // New members are Executive or Member. A President's role is only changed by the Admin.
        const roles = (editing && editing.role === "President") ? ["President"] : ["Executive", "Member"];
        Cohere.Utils.populateSelect(roleSelect, roles.map(function (r) { return { value: r, label: r }; }), "Select a role");
        roleSelect.disabled = !!(editing && editing.role === "President");

        $("member-orgId").value = editing ? editing.orgId : selectedOrgId;
        if (editing) {
            $("member-fullName").value = editing.fullName;
            $("member-studentId").value = editing.studentId;
            $("member-email").value = editing.email || "";
            roleSelect.value = editing.role;
            $("member-specificRole").value = editing.position === editing.role ? "" : editing.position;
            $("member-submit").textContent = "Update Member";
            $("member-cancel").hidden = false;
        }
    }

    function handleMemberSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = $("member-id").value;
        const values = {
            fullName: $("member-fullName").value,
            studentId: $("member-studentId").value,
            orgId: $("member-orgId").value,
            role: $("member-role").value,
            specificRole: $("member-specificRole").value,
            email: $("member-email").value
        };
        Cohere.UI.clearFieldErrors(form);

        const validation = Cohere.Validators.validateMember(values, editingId || null);
        if (!validation.valid) { Cohere.UI.showFieldErrors(form, validation.errors); return; }

        const result = editingId ? Cohere.Store.updateMember(editingId, values) : Cohere.Store.addMember(values);
        if (!result.ok) { Cohere.UI.showToast(result.error, "error"); return; }

        if (!editingId && result.created) {
            Cohere.UI.showToast("Member added. Sign-in: " + result.account.studentId + " · first password: " + result.account.password, "success");
        } else {
            Cohere.UI.showToast(editingId ? "Member updated." : "Member added.", "success");
        }
        resetMemberForm();
        Cohere.App.renderAll();
    }

    function startEditMember(id) {
        const member = Cohere.Store.getMember(id);
        if (!member) return;
        $("member-id").value = member.id;
        renderMemberForm();
        $("member-fullName").focus();
    }

    function handleToggleStatus(id) {
        const member = Cohere.Store.getMember(id);
        if (!member) return;
        const next = member.status === "Inactive" ? "Active" : "Inactive";
        const result = Cohere.Store.setMemberStatus(id, next);
        if (result.ok) {
            Cohere.UI.showToast(member.fullName + " is now " + next + ".", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    function handleMemberDelete(id) {
        const member = Cohere.Store.getMember(id);
        if (!member) return;
        const taskCount = window.Cohere.state.tasks.filter(function (t) { return t.assigneeId === id; }).length;
        let msg = "Delete member \"" + member.fullName + "\"? Their login will stop working.";
        if (taskCount > 0) msg += " This will also delete " + taskCount + " task(s) assigned to them.";
        if (!Cohere.UI.confirmAction(msg)) return;

        const result = Cohere.Store.deleteMember(id);
        if (result.ok) {
            Cohere.UI.showToast("Member deleted.", "success");
            Cohere.App.renderAll();
        } else {
            Cohere.UI.showToast(result.error, "error");
        }
    }

    function resetMemberForm() {
        const form = $("member-form");
        form.reset();
        $("member-id").value = "";
        $("member-submit").textContent = "Add Member";
        $("member-cancel").hidden = true;
        $("member-orgId").value = selectedOrgId;
        $("member-role").disabled = false;
        Cohere.UI.clearFieldErrors(form);
    }

    // ---- Members table ------------------------------------------------------
    function orgMembers() {
        return window.Cohere.state.members.filter(function (m) { return m.orgId === selectedOrgId; });
    }

    function renderFilters() {
        const office = $("member-filter-office");
        const status = $("member-filter-status");
        const offices = [];
        orgMembers().forEach(function (m) { if (m.position && offices.indexOf(m.position) === -1) offices.push(m.position); });
        Cohere.Utils.populateSelect(office, offices.sort().map(function (p) { return { value: p, label: p }; }), "Office/Committee");
        Cohere.Utils.populateSelect(status, Cohere.Config.MEMBER_STATUSES.map(function (s) { return { value: s, label: s }; }), "Status");
    }

    function renderMemberTable() {
        const tbody = $("member-table-body");
        Cohere.Utils.clearEl(tbody);

        const search = ($("member-search").value || "").trim().toLowerCase();
        const office = $("member-filter-office").value;
        const status = $("member-filter-status").value;

        const members = orgMembers().filter(function (m) {
            if (office && m.position !== office) return false;
            if (status && (m.status || "Active") !== status) return false;
            return !search || m.fullName.toLowerCase().includes(search) || m.studentId.toLowerCase().includes(search);
        });

        if (members.length === 0) {
            tbody.appendChild(el("tr", null, [el("td", { textContent: selectedOrgId ? "No members found." : "Select an organization to see its members.", colSpan: "6", className: "text-muted" })]));
            return;
        }

        const rank = { President: 0, Executive: 1, Member: 2 };
        members.slice().sort(function (a, b) { return (rank[a.role] - rank[b.role]) || a.fullName.localeCompare(b.fullName); }).forEach(function (m) {
            const tr = el("tr");
            tr.appendChild(el("td", { textContent: m.fullName }));
            tr.appendChild(el("td", { textContent: m.studentId }));
            tr.appendChild(el("td", { textContent: m.role || "Member" }));
            tr.appendChild(el("td", { textContent: m.position && m.position !== m.role ? m.position : "—" }));
            const st = m.status || "Active";
            const stTd = el("td");
            stTd.appendChild(Cohere.UI.statusBadge(st, st === "Active" ? "completed" : "default"));
            tr.appendChild(stTd);

            const actionsTd = el("td");
            if (Cohere.Permissions.canManageMember(m)) {
                actionsTd.appendChild(el("button", { textContent: "Edit", className: "btn btn-secondary", dataset: { action: "edit", id: m.id } }));
                actionsTd.appendChild(el("button", { textContent: st === "Active" ? "Deactivate" : "Activate", className: "btn btn-secondary", style: "margin-left: 4px;", dataset: { action: "toggle", id: m.id } }));
                actionsTd.appendChild(el("button", { textContent: "Delete", className: "btn btn-danger", style: "margin-left: 4px;", dataset: { action: "delete", id: m.id } }));
            } else {
                actionsTd.textContent = "—";
            }
            tr.appendChild(actionsTd);
            tbody.appendChild(tr);
        });
    }

    return { init, render, renderMemberTable };
})();
