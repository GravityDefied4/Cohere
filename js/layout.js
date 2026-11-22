window.Cohere = window.Cohere || {};
// Layout chrome: login gate, page titles, role pill, form panels and the Add Task stepper.
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
        const linked = Cohere.Accounts.findMember(account);
        if (linked && linked.status === "Inactive") { err.textContent = "This account is inactive. Please contact your organization president."; err.hidden = false; return; }
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
    }
    function onView(name) {
        $("page-title").textContent = TITLES[name] || "Cohere";
        document.title = (TITLES[name] || "Cohere") + " · Cohere";
        closeAllPanels();
        const main = $("main"); if (main) window.scrollTo({ top: 0 });
    }

    // ---- Form panels --------------------------------------------------------
    function openPanel(id) {
        const p = $(id); if (!p) return;
        p.hidden = false;
        if (id === "task-panel") setStep(1);
        p.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const first = p.querySelector("input:not([type=hidden]), textarea, select");
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
    }
    function closePanel(id) {
        const p = $(id); if (!p) return;
        p.hidden = true;
        if (id === "task-panel") setStep(1);
    }
    function closeAllPanels() { document.querySelectorAll(".form-panel").forEach(function (p) { closePanel(p.id); }); }

    // ---- Add Task stepper ---------------------------------------------------
    function setStep(n) {
        const form = $("task-form"); if (!form) return;
        form.dataset.step = n;
        form.querySelectorAll(".step").forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
        document.querySelectorAll("#task-panel .stepper li").forEach(function (li, i) {
            li.classList.toggle("on", i + 1 === n);
            li.classList.toggle("done", i + 1 < n);
        });
    }
    function currentStep() { return Number($("task-form").dataset.step) || 1; }
    function stepOfFirstError(form) {
        const bad = form.querySelector(".is-invalid");
        const step = bad && bad.closest(".step");
        return step ? Number(step.dataset.step) : 0;
    }

    function init() {
        initTheme();
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

        // Stepper navigation
        const form = $("task-form");
        document.querySelector("#task-panel .wiz-next").addEventListener("click", function () { setStep(Math.min(3, currentStep() + 1)); });
        document.querySelector("#task-panel .wiz-back").addEventListener("click", function () { setStep(Math.max(1, currentStep() - 1)); });
        // Pressing Enter before the last step moves forward instead of submitting
        document.addEventListener("submit", function (e) {
            if (e.target === form && currentStep() < 3) { e.preventDefault(); e.stopPropagation(); setStep(currentStep() + 1); }
        }, true);

        // After a submit: jump to the step with an error, or close the panel when the form was reset (success)
        document.addEventListener("submit", function (e) {
            const f = e.target; const panel = f.closest && f.closest(".form-panel");
            if (!panel) return;
            setTimeout(function () {
                if (f === form) { const s = stepOfFirstError(f); if (s) { setStep(s); return; } }
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