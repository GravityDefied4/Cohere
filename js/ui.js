window.Cohere = window.Cohere || {};
Cohere.UI = (function () {
    "use strict";

    // Builds an <svg><use/></svg> icon from the sprite in index.html
    function icon(name) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "ic");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(NS, "use");
        use.setAttribute("href", "#i-" + name);
        svg.appendChild(use);
        return svg;
    }

    const TOAST_ICONS = { success: "check", error: "cross", info: "info" };

    // Shows a toast message. Longer messages stay up longer; hovering pauses the timer.
    function showToast(message, type) {
        const container = document.getElementById("toast-container");
        if (!container) return;
        type = TOAST_ICONS[type] ? type : "info";

        const toast = Cohere.Utils.createEl("div", {
            className: "toast toast-" + type,
            role: type === "error" ? "alert" : "status"
        });
        const ico = Cohere.Utils.createEl("span", { className: "toast-ico" }, [icon(TOAST_ICONS[type])]);
        const msg = Cohere.Utils.createEl("div", { className: "toast-msg", textContent: message });
        const close = Cohere.Utils.createEl("button", {
            type: "button", className: "toast-close", "aria-label": "Dismiss"
        }, [icon("x")]);
        const bar = Cohere.Utils.createEl("span", { className: "toast-bar", "aria-hidden": "true" });

        const text = String(message || "");
        const duration = Math.min(8000, Math.max(type === "error" ? 4500 : 3000, text.length * 55));
        bar.style.animationDuration = duration + "ms";

        toast.appendChild(ico);
        toast.appendChild(msg);
        toast.appendChild(close);
        toast.appendChild(bar);
        container.appendChild(toast);

        let timer = null;
        let remaining = duration;
        let startedAt = 0;

        function dismiss() {
            clearTimeout(timer);
            if (toast.classList.contains("toast-hide")) return;
            toast.classList.add("toast-hide");
            setTimeout(function () { toast.remove(); }, 260);
        }
        function start() {
            startedAt = Date.now();
            timer = setTimeout(dismiss, remaining);
        }

        toast.addEventListener("mouseenter", function () {
            clearTimeout(timer);
            remaining -= Date.now() - startedAt;
        });
        toast.addEventListener("mouseleave", start);
        close.addEventListener("click", dismiss);
        start();
    }

    // Opens a modal
    function openModal(title, contentNode) {
        const overlay = document.getElementById("modal-overlay");
        const titleEl = document.getElementById("modal-title");
        const bodyEl = document.getElementById("modal-body");
        if (!overlay || !titleEl || !bodyEl) return;
        titleEl.textContent = title;
        Cohere.Utils.clearEl(bodyEl);
        if (contentNode) bodyEl.appendChild(contentNode);
        overlay.hidden = false;
    }

    // Closes the modal and notification panel
    function closeModal() {
        const overlay = document.getElementById("modal-overlay");
        if (overlay) overlay.hidden = true;
        const notifPanel = document.getElementById("notif-panel");
        if (notifPanel) notifPanel.hidden = true;
    }

    // Wraps window.confirm
    function confirmAction(message) {
        return window.confirm(message);
    }

    // Shows field errors on a form
    function showFieldErrors(form, errors) {
        if (!form || !errors) return;
        Object.keys(errors).forEach(function (field) {
            const input = form.querySelector("#" + field);
            if (input) {
                input.classList.add("is-invalid");
                input.setAttribute("aria-invalid", "true");
                const errEl = Cohere.Utils.createEl("small", { className: "field-error", textContent: errors[field] });
                input.parentNode.insertBefore(errEl, input.nextSibling);
            }
        });
        showToast("Please fix the highlighted fields.", "error");
    }

    // Clears all field errors in a form
    function clearFieldErrors(form) {
        if (!form) return;
        form.querySelectorAll(".field-error").forEach(function (el) { el.remove(); });
        form.querySelectorAll(".is-invalid").forEach(function (el) {
            el.classList.remove("is-invalid");
            el.removeAttribute("aria-invalid");
        });
    }

    // Clears a specific field error
    function clearFieldError(field) {
        if (!field) return;
        field.classList.remove("is-invalid");
        field.removeAttribute("aria-invalid");
        const next = field.nextElementSibling;
        if (next && next.classList.contains("field-error")) next.remove();
    }

    // Toggles the sidebar on mobile
    function toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.toggle("sidebar-open");
    }

    // Creates a status badge element
    function statusBadge(text, kind) {
        return Cohere.Utils.createEl("span", { className: "badge badge-" + (kind || "default"), textContent: text });
    }

    // M9: Applies permissions to the UI (hides forms/buttons, shows view-only notes)
    function applyPermissions() {
        // Hide elements the user cannot use
        document.querySelectorAll("[data-permission]").forEach(function (el) {
            const action = el.dataset.permission;
            if (!Cohere.Permissions.can(action)) {
                el.hidden = true;
            } else {
                el.hidden = false;
            }
        });

        // Show view-only notes for actions the user cannot use
        document.querySelectorAll("[data-permission-note]").forEach(function (el) {
            const action = el.dataset.permissionNote;
            if (!Cohere.Permissions.can(action)) {
                el.hidden = false;
            } else {
                el.hidden = true;
            }
        });
    }

    // Attach global listeners for modal/overlay close and field error clearing
    function attachGlobalListeners() {
        const closeButton = document.getElementById("modal-close");
        if (closeButton) {
            closeButton.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            });
        }

        document.addEventListener("click", function (e) {
            if (e.target.id === "modal-overlay") {
                closeModal();
            }
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeModal();
        });
        document.addEventListener("input", function (e) {
            if (e.target.matches("input, textarea, select")) {
                clearFieldError(e.target);
            }
        });
    }

    attachGlobalListeners();

    return { icon, showToast, openModal, closeModal, confirmAction, showFieldErrors, clearFieldErrors, clearFieldError, toggleSidebar, statusBadge, applyPermissions };
})();