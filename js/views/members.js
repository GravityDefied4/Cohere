window.Cohere = window.Cohere || {};
// Organization tab: org picker, Admin tools (create organizations, assign president),
// President tools (add members) and the members table.
Cohere.Members = (function () {
    "use strict";

    const $ = function (id) { return document.getElementById(id); };
    const el = function (tag, props, kids) { return Cohere.Utils.createEl(tag, props, kids); };
    let selectedOrgId = "";

    // Organizations the signed-in person may see: Admin sees all, others the ones they belong to
    function visibleOrgs() { return Cohere.Permissions.getAvailableOrgs(); }

    // The organization shown here is the one chosen in the header dropdown (the "active" organization)
    function ensureSelection() { selectedOrgId = Cohere.Permissions.getActiveOrgId(); }

    function selectedOrg() { return Cohere.Store.getOrg(selectedOrgId); }

    function init() {
        // Org picker
        $("org-picker-btn").addEventListener("click", function () { togglePicker(); });
        $("org-picker-list").addEventListener("click", function (e) {
            const item = e.target.closest("[data-org]");
            if (!item) return;
            togglePicker(false);
            resetMemberForm();
            Cohere.Layout.closePanel("member-panel");
            Cohere.Layout.closePanel("president-panel");
            // Same switch as the header dropdown, so the whole app follows the chosen organization
            Cohere.Permissions.setActiveOrg(item.dataset.org);
            Cohere.App.renderAll();
        });
        document.addEventListener("click", function (e) {
            if (!e.target.closest("#org-picker")) togglePicker(false);
        });

        // Organization logo field inside the add / edit form
        $("org-logo-upload").addEventListener("click", function () { $("org-logo-input").click(); });
        $("org-logo-input").addEventListener("change", handleLogoChosen);
        $("org-logo-remove").addEventListener("click", function () { pendingLogo = null; renderLogoField(); });

        // "..." action menu (organization + member rows): close on outside click / Escape / scroll / resize
        document.addEventListener("click", function (e) {
            if (!e.target.closest("#action-menu") && !e.target.closest(".kebab-btn")) closeActionMenu(false);
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeActionMenu(true); });
        window.addEventListener("resize", repositionActionMenu);
        window.addEventListener("scroll", repositionActionMenu, true);

        // Organization form (Admin)
        $("org-form").addEventListener("submit", handleOrgSubmit);
        $("org-cancel").addEventListener("click", resetOrgForm);
        $("org-detail").addEventListener("click", function (e) {
            const btn = e.target.closest(".kebab-btn");
            if (btn) openActionMenu(btn, orgMenuItems());
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
            const btn = e.target.closest(".kebab-btn");
            if (btn) openActionMenu(btn, memberMenuItems(btn.dataset.id));
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
        applyOrb($("org-picker-orb"), org);

        const list = $("org-picker-list");
        Cohere.Utils.clearEl(list);
        orgs.forEach(function (o) {
            const li = el("li", { dataset: { org: o.id }, tabindex: "0", className: o.id === selectedOrgId ? "is-selected" : "" });
            const orb = el("span", { className: "org-orb", "aria-hidden": "true" });
            applyOrb(orb, o);
            li.appendChild(orb);
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

    // ---- Organization logo --------------------------------------------------
    const SAFE_PICTURE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
    const PICTURE_SIZE = 256;            // saved as a 256 x 256 square
    const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
    // Logo chosen in the open form but not saved yet: undefined = unchanged, null = remove, string = new image
    let pendingLogo;

    // Shows the organization's logo on an orb, or the default gradient orb
    function applyOrb(node, org) {
        if (!node) return;
        const pic = org && typeof org.picture === "string" && SAFE_PICTURE.test(org.picture) ? org.picture : "";
        node.classList.toggle("has-picture", !!pic);
        node.style.backgroundImage = pic ? 'url("' + pic + '")' : "";
    }

    // Logo preview + buttons inside the add / edit form
    function renderLogoField() {
        const editingId = $("org-id").value;
        const org = editingId ? Cohere.Store.getOrg(editingId) : null;
        const current = pendingLogo !== undefined ? pendingLogo : (org ? org.picture : null);
        applyOrb($("org-logo-preview"), current ? { picture: current } : null);
        $("org-logo-upload").textContent = current ? "Change logo" : "Upload logo";
        $("org-logo-remove").hidden = !current;
    }

    // Reads an image file, crops it to a centred square and shrinks it
    function pictureFromFile(file, done) {
        const reader = new FileReader();
        reader.onerror = function () { done("Could not read that file."); };
        reader.onload = function () {
            const img = new Image();
            img.onerror = function () { done("That file is not a valid image."); };
            img.onload = function () {
                const side = Math.min(img.naturalWidth, img.naturalHeight);
                if (!side) { done("That file is not a valid image."); return; }
                const canvas = document.createElement("canvas");
                canvas.width = PICTURE_SIZE;
                canvas.height = PICTURE_SIZE;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
                const sx = (img.naturalWidth - side) / 2;
                const sy = (img.naturalHeight - side) / 2;
                ctx.drawImage(img, sx, sy, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
                done(null, canvas.toDataURL("image/jpeg", 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    function handleLogoChosen(e) {
        const input = e.target;
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        const editingId = $("org-id").value;
        const allowed = editingId ? Cohere.Permissions.canEditOrgPicture(editingId) : Cohere.Permissions.can("manageOrgs");
        if (!allowed) {
            Cohere.UI.showToast("Only the Admin or this organization's President can change its logo.", "error");
            return;
        }
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
            Cohere.UI.showToast("Choose a PNG, JPG, WebP or GIF image.", "error");
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            Cohere.UI.showToast("That image is larger than 8 MB. Choose a smaller one.", "error");
            return;
        }
        pictureFromFile(file, function (err, dataUrl) {
            if (err) { Cohere.UI.showToast(err, "error"); return; }
            pendingLogo = dataUrl;
            renderLogoField();
        });
    }

    // ---- "..." action menu (shared by the organization bar and every member row) ----
    // One floating menu lives on <body> so the table's horizontal scroll can never clip it.
    let menuAnchor = null;
    let menuItems = [];

    function getActionMenu() {
        let menu = $("action-menu");
        if (menu) return menu;
        menu = el("div", { id: "action-menu", className: "action-menu", role: "menu", hidden: "" });
        document.body.appendChild(menu);
        menu.addEventListener("click", function (e) {
            const btn = e.target.closest("[data-i]");
            if (!btn) return;
            const item = menuItems[Number(btn.dataset.i)];
            closeActionMenu(true);
            if (item && item.run) item.run();
        });
        menu.addEventListener("keydown", function (e) {
            const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
            if (keys.indexOf(e.key) === -1) return;
            e.preventDefault();
            const btns = Array.prototype.slice.call(menu.querySelectorAll(".action-menu-item"));
            if (!btns.length) return;
            const at = btns.indexOf(document.activeElement);
            let next = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 :
                e.key === "ArrowDown" ? (at + 1) % btns.length : (at - 1 + btns.length) % btns.length;
            btns[next].focus();
        });
        return menu;
    }

    function openActionMenu(anchor, items) {
        const menu = getActionMenu();
        const sameButton = menuAnchor === anchor && !menu.hidden;
        closeActionMenu(false);
        if (sameButton || !items.length) return;

        menuItems = items;
        menuAnchor = anchor;
        Cohere.Utils.clearEl(menu);
        items.forEach(function (it, i) {
            if (it.sep) { menu.appendChild(el("div", { className: "action-menu-sep", role: "separator" })); return; }
            menu.appendChild(el("button", {
                type: "button", role: "menuitem",
                className: "action-menu-item" + (it.danger ? " is-danger" : ""),
                dataset: { i: String(i) }
            }, [Cohere.UI.icon(it.icon), el("span", { textContent: it.label })]));
        });

        menu.style.visibility = "hidden";
        menu.hidden = false;
        placeActionMenu();
        menu.style.visibility = "";

        anchor.setAttribute("aria-expanded", "true");
        const first = menu.querySelector(".action-menu-item");
        if (first) first.focus({ preventScroll: true });
    }

    // Place under the button, right edges aligned; flip above when there is no room below
    function placeActionMenu() {
        const menu = $("action-menu");
        if (!menu || !menuAnchor) return;
        const r = menuAnchor.getBoundingClientRect();
        const w = menu.offsetWidth, h = menu.offsetHeight;
        const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
        let top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
        menu.style.left = left + "px";
        menu.style.top = top + "px";
    }

    // The menu follows its button while the page scrolls; it closes once the button is out of view
    function repositionActionMenu() {
        const menu = $("action-menu");
        if (!menu || menu.hidden || !menuAnchor) return;
        const r = menuAnchor.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { closeActionMenu(false); return; }
        placeActionMenu();
    }

    function closeActionMenu(returnFocus) {
        const menu = $("action-menu");
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        if (menuAnchor) {
            menuAnchor.setAttribute("aria-expanded", "false");
            if (returnFocus && document.body.contains(menuAnchor)) menuAnchor.focus({ preventScroll: true });
        }
        menuAnchor = null;
    }

    function kebabButton(label, props) {
        return el("button", Object.assign({
            type: "button", className: "kebab-btn", "aria-label": label,
            "aria-haspopup": "menu", "aria-expanded": "false"
        }, props || {}), [Cohere.UI.icon("more")]);
    }

    // Actions for the selected organization. Admin: everything. President: edit logo only.
    function orgMenuItems() {
        const org = selectedOrg();
        const isAdmin = Cohere.Permissions.can("manageOrgs");
        const pres = org ? Cohere.Store.getPresident(org.id) : null;
        const items = [];
        if (org && Cohere.Permissions.canEditOrgPicture(org.id)) {
            items.push({ label: "Edit organization", icon: "edit", run: function () { Cohere.Layout.openPanel("org-panel"); startEditOrg(org.id); } });
        }
        if (org && isAdmin) {
            items.push({ label: pres ? "Change president" : "Assign president", icon: "userplus", run: openPresidentForm });
        }
        if (isAdmin) {
            items.push({ label: "Add organization", icon: "plus", run: function () { resetOrgForm(); Cohere.Layout.openPanel("org-panel"); } });
        }
        if (org && isAdmin) {
            items.push({ sep: true });
            items.push({ label: "Delete organization", icon: "trash", danger: true, run: function () { handleOrgDelete(org.id); } });
        }
        return items;
    }

    // Actions for one member row
    function memberMenuItems(id) {
        const member = Cohere.Store.getMember(id);
        if (!member || !Cohere.Permissions.canManageMember(member)) return [];
        const active = (member.status || "Active") === "Active";
        return [
            { label: "Edit member", icon: "edit", run: function () { Cohere.Layout.openPanel("member-panel"); startEditMember(id); } },
            { label: active ? "Deactivate" : "Activate", icon: active ? "cross" : "check", run: function () { handleToggleStatus(id); } },
            { sep: true },
            { label: "Delete member", icon: "trash", danger: true, run: function () { handleMemberDelete(id); } }
        ];
    }

    // "..." button beside the organization card's arrow
    function renderOrgDetail() {
        const box = $("org-detail");
        if (!box) return;
        closeActionMenu(false);
        Cohere.Utils.clearEl(box);
        const org = selectedOrg();

        const hasActions = orgMenuItems().length > 0;
        box.hidden = !hasActions;
        if (!hasActions) return;

        // Sits beside the arrow of the organization card: these actions apply to the selected organization
        const label = org ? "Actions for " + org.name : "Organization actions";
        box.appendChild(kebabButton(label, { id: "org-menu-btn", title: label }));
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

    // ---- Organization form (Admin: all fields. President: logo only) -------
    function handleOrgSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = $("org-id").value;
        const isAdmin = Cohere.Permissions.can("manageOrgs");
        Cohere.UI.clearFieldErrors(form);

        // President: only the logo can change
        if (editingId && !isAdmin) {
            if (pendingLogo === undefined) {
                Cohere.UI.showToast("Choose a new logo or remove the current one first.", "info");
                return;
            }
            const r = Cohere.Store.setOrgPicture(editingId, pendingLogo);
            if (!r.ok) { Cohere.UI.showToast(r.error, "error"); return; }
            Cohere.UI.showToast(pendingLogo ? "Organization logo updated." : "Organization logo removed.", "success");
            resetOrgForm();
            Cohere.App.renderAll();
            return;
        }

        const values = { name: $("org-name").value, description: $("org-desc").value };
        const validation = Cohere.Validators.validateOrg(values, editingId || null);
        if (!validation.valid) { Cohere.UI.showFieldErrors(form, validation.errors); return; }

        const result = editingId ? Cohere.Store.updateOrg(editingId, values) : Cohere.Store.addOrg(values);
        if (!result.ok) { Cohere.UI.showToast(result.error, "error"); return; }
        if (!editingId) Cohere.Permissions.setActiveOrg(result.data.id);

        // Save the logo chosen in the form (a new organization only needs it when one was picked)
        if (pendingLogo !== undefined && (editingId || pendingLogo)) {
            const pr = Cohere.Store.setOrgPicture(result.data.id, pendingLogo);
            if (!pr.ok) Cohere.UI.showToast(pr.error, "error");
        }
        Cohere.UI.showToast(editingId ? "Organization updated." : "Organization added. Now assign its president.", "success");
        resetOrgForm();
        Cohere.App.renderAll();
    }

    function startEditOrg(id) {
        const org = Cohere.Store.getOrg(id);
        if (!org) return;
        const isAdmin = Cohere.Permissions.can("manageOrgs");
        pendingLogo = undefined;
        $("org-id").value = org.id;
        $("org-name").value = org.name;
        $("org-desc").value = org.description;
        $("org-name").disabled = !isAdmin;
        $("org-desc").disabled = !isAdmin;
        $("org-lock-hint").hidden = isAdmin;
        $("org-panel-title").textContent = "Edit organization";
        $("org-submit").textContent = isAdmin ? "Update Organization" : "Save logo";
        $("org-cancel").hidden = false;
        renderLogoField();
        if (isAdmin) $("org-name").focus();
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
        pendingLogo = undefined;
        $("org-id").value = "";
        $("org-name").disabled = false;
        $("org-desc").disabled = false;
        $("org-lock-hint").hidden = true;
        $("org-panel-title").textContent = "Add organization";
        $("org-submit").textContent = "Add Organization";
        $("org-cancel").hidden = true;
        Cohere.UI.clearFieldErrors(form);
        renderLogoField();
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
        closeActionMenu(false);
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

            const actionsTd = el("td", { className: "col-actions" });
            if (Cohere.Permissions.canManageMember(m)) {
                actionsTd.appendChild(kebabButton("Actions for " + m.fullName, { dataset: { id: m.id } }));
            } else {
                actionsTd.textContent = "—";
            }
            tr.appendChild(actionsTd);
            tbody.appendChild(tr);
        });
    }

    return { init, render, renderMemberTable, applyOrb, resetMemberForm, openActionMenu, closeActionMenu };
})();
