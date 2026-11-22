window.Cohere = window.Cohere || {};
// Layout chrome: login gate, page titles, role pill, and the form panels.
Cohere.Layout = (function () {
    "use strict";

    const TITLES = {
        dashboard: "Overview", members: "Organization", tasks: "Task Delegation", appointments: "Schedule",
        attendance: "Attendance", performance: "Performance", activity: "Activity Log", settings: "Settings"
    };
    const EDIT_TARGETS = { "org-detail": "org-panel", "member-table-body": "member-panel", "task-list": "task-panel", "appt-list": "appt-panel" };
    const $ = function (id) { return document.getElementById(id); };

    // ---- Theme (light / dark) ----------------------------------------------
    const THEME_KEY = "cohere.theme";
    function savedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
    function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
    function applyTheme(theme, persist) {
        document.documentElement.setAttribute("data-theme", theme);
        if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ } }
        document.querySelectorAll(".js-theme").forEach(function (b) {
            const next = theme === "dark" ? "light" : "dark";
            b.setAttribute("aria-label", "Switch to " + next + " mode");
            b.setAttribute("title", "Switch to " + next + " mode");
        });
    }
    function toggleTheme() {
        const root = document.documentElement;
        root.classList.add("theme-anim");
        applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
        setTimeout(function () { root.classList.remove("theme-anim"); }, 350);
    }
    function initTheme() {
        applyTheme(currentTheme(), false);
        document.querySelectorAll(".js-theme").forEach(function (b) { b.addEventListener("click", toggleTheme); });
        // Follow the device setting until the user picks a theme themselves
        if (window.matchMedia) {
            const mq = matchMedia("(prefers-color-scheme: dark)");
            const onChange = function (e) { if (!savedTheme()) applyTheme(e.matches ? "dark" : "light", false); };
            if (mq.addEventListener) mq.addEventListener("change", onChange);
        }
    }

    // ---- Login (checked against the accounts in js/accounts.js) -------------
    function isSignedIn() { return Cohere.Permissions.isSignedIn(); }
    function showApp(on) { $("login-screen").hidden = on; $("app").hidden = !on; }

    function handleLogin(e) {
        e.preventDefault();
        const id = $("login-id").value.trim();
        const pw = $("login-pw").value;
        const err = $("login-error");
        err.hidden = true;
        if (!id || !pw) { err.textContent = "Please enter your email or student ID and your password."; err.hidden = false; return; }
        const V = Cohere.Validators;
        const isAdminName = id.toLowerCase() === "admin";
        if (!isAdminName && !V.isStudentEmail(id) && !V.isStudentId(id)) {
            err.textContent = "Enter a student email (name.123.stud@cdd.edu.ph) or a student ID (24-1234-123).";
            err.hidden = false; $("login-id").focus(); return;
        }
        const account = Cohere.Accounts.authenticate(id, pw);
        if (!account) { err.textContent = "Incorrect email/student ID or password."; err.hidden = false; return; }
        const linked = Cohere.Accounts.findMemberships(account);
        if (linked.length && linked.every(function (m) { return m.status === "Inactive"; })) { err.textContent = "This account is inactive. Please contact your organization president."; err.hidden = false; return; }
        Cohere.Permissions.signIn(account);
        $("login-id").value = "";
        $("login-pw").value = "";
        showApp(true);
        Cohere.App.renderAll();
        Cohere.App.showView("dashboard");
        Cohere.UI.showToast("Welcome, " + Cohere.Permissions.getActor().name + ".", "success");
    }

    // ---- Log out confirmation -----------------------------------------------
    function openLogoutDialog() {
        $("sidebar").classList.remove("sidebar-open");
        $("logout-overlay").hidden = false;
        $("logout-cancel").focus();
    }
    function closeLogoutDialog() {
        $("logout-overlay").hidden = true;
        $("btn-logout").focus();
    }
    function confirmLogout() {
        $("logout-overlay").hidden = true;
        logout();
        Cohere.UI.showToast("You have been logged out.", "info");
    }

    function logout() {
        Cohere.Permissions.signOut();
        closeAllPanels();
        showApp(false);
        $("login-id").focus();
    }

    // ---- Header chrome ------------------------------------------------------
    function refresh() {
        const actor = Cohere.Permissions.getActor();
        $("role-pill").textContent = actor.role || "Guest";
        $("avatar").textContent = (actor.name || "A").trim().charAt(0).toUpperCase();
        renderOrgSwitch();
    }

    // ---- Organization dropdown (header) --------------------------------------
    // Lists the organizations the person belongs to (Admin: all of them) with a short summary of each.
    // Choosing one switches the whole app to that organization, and the role pill shows the role held there.
    function orgSwitchMeta(org) {
        const count = window.Cohere.state.members.filter(function (m) { return m.orgId === org.id; }).length;
        const countText = count + " member" + (count !== 1 ? "s" : "");
        if (Cohere.Permissions.getActor().isAdmin) {
            const pres = Cohere.Store.getPresident(org.id);
            return (pres ? "President: " + pres.fullName : "No president yet") + " · " + countText;
        }
        const mine = Cohere.Permissions.getMemberships().find(function (m) { return m.orgId === org.id; });
        let role = "";
        if (mine) role = mine.position && mine.position !== mine.role ? mine.role + " · " + mine.position : mine.role;
        return (role ? "You: " + role + " · " : "") + countText;
    }

    function renderOrgSwitch() {
        const root = $("org-switch");
        if (!root) return;
        const orgs = Cohere.Permissions.getAvailableOrgs();
        const activeId = Cohere.Permissions.getActiveOrgId();
        const active = orgs.find(function (o) { return o.id === activeId; }) || null;
        const el = Cohere.Utils.createEl;

        $("org-switch-name").textContent = active ? active.name : "No organization";
        Cohere.Members.applyOrb($("org-switch-orb"), active);
        $("org-switch-btn").disabled = orgs.length === 0;
        root.classList.toggle("is-empty", orgs.length === 0);

        const list = $("org-switch-list");
        Cohere.Utils.clearEl(list);
        orgs.forEach(function (o) {
            const selected = o.id === activeId;
            const orb = el("span", { className: "org-orb", "aria-hidden": "true" });
            Cohere.Members.applyOrb(orb, o);
            const item = el("button", {
                type: "button", role: "option", className: "org-switch-item" + (selected ? " is-selected" : ""),
                "aria-selected": String(selected), dataset: { org: o.id }
            }, [
                orb,
                el("span", { className: "org-switch-text" }, [
                    el("strong", { textContent: o.name }),
                    el("span", { className: "org-switch-desc", textContent: o.description || "No description" }),
                    el("span", { className: "org-switch-meta", textContent: orgSwitchMeta(o) })
                ]),
                selected ? Cohere.UI.icon("check") : null
            ]);
            list.appendChild(item);
        });
        toggleOrgSwitch(false);
    }

    function toggleOrgSwitch(force) {
        const list = $("org-switch-list"), btn = $("org-switch-btn");
        if (!list || !btn) return;
        const open = (typeof force === "boolean" ? force : list.hidden) && list.children.length > 0;
        list.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        $("org-switch").classList.toggle("open", open);
        if (open) {
            const sel = list.querySelector(".is-selected") || list.firstElementChild;
            if (sel) sel.focus({ preventScroll: true });
        }
    }

    function chooseOrg(id) {
        toggleOrgSwitch(false);
        if (id === Cohere.Permissions.getActiveOrgId()) { $("org-switch-btn").focus(); return; }
        if (!Cohere.Permissions.setActiveOrg(id)) return;
        // Forms in progress belong to the organization we just left
        closeAllPanels();
        if (Cohere.Members && Cohere.Members.resetMemberForm) Cohere.Members.resetMemberForm();
        Cohere.App.renderAll();
        const org = Cohere.Store.getOrg(id);
        Cohere.UI.showToast("Now viewing " + (org ? org.name : "organization") + ".", "info");
        $("org-switch-btn").focus();
    }

    function initOrgSwitch() {
        $("org-switch-btn").addEventListener("click", function () { toggleOrgSwitch(); });
        $("org-switch-list").addEventListener("click", function (e) {
            const item = e.target.closest("[data-org]");
            if (item) chooseOrg(item.dataset.org);
        });
        document.addEventListener("click", function (e) { if (!e.target.closest("#org-switch")) toggleOrgSwitch(false); });
        document.addEventListener("keydown", function (e) {
            const list = $("org-switch-list");
            if (!list) return;
            if (e.key === "Escape" && !list.hidden) { toggleOrgSwitch(false); $("org-switch-btn").focus(); return; }
            const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
            if (keys.indexOf(e.key) === -1 || !e.target.closest("#org-switch")) return;
            e.preventDefault();
            if (list.hidden) { toggleOrgSwitch(true); return; }
            const items = Array.prototype.slice.call(list.querySelectorAll(".org-switch-item"));
            const at = items.indexOf(document.activeElement);
            const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 :
                e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
            items[next].focus();
        });
    }
    function onView(name) {
        // The Organization tab has its own organization picker, so the header dropdown is hidden there
        const sw = $("org-switch");
        if (sw) { toggleOrgSwitch(false); sw.hidden = name === "members"; }
        $("page-title").textContent = TITLES[name] || "Cohere";
        document.title = (TITLES[name] || "Cohere") + " · Cohere";
        closeAllPanels();
        const main = $("main"); if (main) window.scrollTo({ top: 0 });
    }

    // ---- Form panels --------------------------------------------------------
    function openPanel(id) {
        const p = $(id); if (!p) return;
        p.hidden = false;
        p.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const first = p.querySelector("input:not([type=hidden]), textarea, select");
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
    }
    function closePanel(id) {
        const p = $(id); if (!p) return;
        p.hidden = true;
    }
    function closeAllPanels() { document.querySelectorAll(".form-panel").forEach(function (p) { closePanel(p.id); }); }

    function init() {
        initTheme();
        initOrgSwitch();
        $("login-form").addEventListener("submit", handleLogin);
        $("btn-logout").addEventListener("click", openLogoutDialog);
        $("logout-cancel").addEventListener("click", closeLogoutDialog);
        $("logout-confirm").addEventListener("click", confirmLogout);
        $("logout-overlay").addEventListener("click", function (e) { if (e.target.id === "logout-overlay") closeLogoutDialog(); });
        document.addEventListener("keydown", function (e) {
            if ($("logout-overlay").hidden) return;
            if (e.key === "Escape") { e.stopPropagation(); closeLogoutDialog(); }
            else if (e.key === "Tab") {
                // keep focus inside the dialog
                const a = $("logout-cancel"), b = $("logout-confirm");
                if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
                else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
            }
        }, true);
        $("notif-close").addEventListener("click", function () { $("notif-panel").hidden = true; });
        $("sidebar-scrim").addEventListener("click", function () { $("sidebar").classList.remove("sidebar-open"); });

        // Open / close panels
        document.addEventListener("click", function (e) {
            const opener = e.target.closest("[data-open]");
            if (opener) { openPanel(opener.dataset.open); return; }
            const closer = e.target.closest(".panel-close");
            if (closer) {
                const panel = closer.closest(".form-panel");
                const cancel = panel.querySelector("button[id$='-cancel']");
                if (cancel && !cancel.hidden) cancel.click();
                closePanel(panel.id);
                return;
            }
            const cancelBtn = e.target.closest("button[id$='-cancel']");
            if (cancelBtn) { const p = cancelBtn.closest(".form-panel"); if (p) closePanel(p.id); }
        });

        // Capture phase: open the right panel before the view's own Edit handler fills and focuses it
        document.addEventListener("click", function (e) {
            const btn = e.target.closest("button[data-action='edit']");
            if (!btn) return;
            const host = btn.closest("#org-detail, #member-table-body, #task-list, #appt-list");
            if (host && EDIT_TARGETS[host.id]) openPanel(EDIT_TARGETS[host.id]);
        }, true);

        // After a submit: close the panel when the form was reset (success)
        document.addEventListener("submit", function (e) {
            const f = e.target; const panel = f.closest && f.closest(".form-panel");
            if (!panel) return;
            setTimeout(function () {
                const idEl = f.querySelector("input[type=hidden]");
                const firstText = f.querySelector("input[type=text], textarea");
                if (!f.querySelector(".is-invalid") && (!idEl || !idEl.value) && (!firstText || !firstText.value)) closePanel(panel.id);
            }, 0);
        });

        if (isSignedIn()) showApp(true); else showApp(false);
        refresh();
    }

    return { init, refresh, onView, openPanel, closePanel };
})();