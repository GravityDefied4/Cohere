window.Cohere = window.Cohere || {};
Cohere.Settings = (function () {
    "use strict";

    // The full list of state collections we manage
    const COLLECTIONS = [
        "organizations", "members", "tasks", "appointments",
        "attendance", "activity", "notifications"
    ];

    // Initializes the settings view (attach listeners once)
    function init() {
        const loadBtn = document.getElementById("btn-load-sample");
        if (loadBtn) loadBtn.addEventListener("click", handleLoadSample);

        const resetBtn = document.getElementById("btn-reset-data");
        if (resetBtn) resetBtn.addEventListener("click", handleReset);

        const exportBtn = document.getElementById("btn-export");
        if (exportBtn) exportBtn.addEventListener("click", handleExport);

        const importInput = document.getElementById("input-import");
        if (importInput) importInput.addEventListener("change", handleImport);
    }

    // Renders the settings view (shows storage usage)
    function render() {
        const box = document.getElementById("settings-info");
        if (!box) return;
        Cohere.Utils.clearEl(box);

        const bytes = Cohere.Storage.getUsageBytes();
        const kb = (bytes / 1024).toFixed(1);
        box.appendChild(Cohere.Utils.createEl("p", {
            textContent: "Storage used: " + kb + " KB",
            className: "text-muted"
        }));
        box.appendChild(Cohere.Utils.createEl("p", {
            textContent: "Members: " + window.Cohere.state.members.length +
                " · Tasks: " + window.Cohere.state.tasks.length +
                " · Meetings: " + window.Cohere.state.appointments.length,
            className: "text-muted"
        }));
    }

    // Load Sample Data: replace all current data with fresh sample data
    function handleLoadSample() {
        if (!Cohere.Permissions.can("manageData")) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("manageData"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("This will replace all current data with sample data. Continue?")) return;

        const seed = Cohere.Seed.generate();
        Object.keys(seed).forEach(function (key) {
            window.Cohere.state[key] = seed[key];
        });

        // Log the action AFTER loading so it appears in the new log
        Cohere.Activity.log("settings", "Loaded sample data");

        Cohere.Storage.saveAll();
        Cohere.UI.showToast("Sample data loaded.", "success");
        Cohere.App.renderAll();
    }

    // Reset All Data: clear everything and mark as unseeded
    function handleReset() {
        if (!Cohere.Permissions.can("manageData")) {
            Cohere.UI.showToast(Cohere.Permissions.denyMessage("manageData"), "error");
            return;
        }
        if (!Cohere.UI.confirmAction("This will delete ALL data and cannot be undone. Export a backup first if needed. Continue?")) return;

        window.Cohere.state = {
            organizations: [],
            members: [],
            tasks: [],
            appointments: [],
            attendance: [],
            activity: [],
            notifications: [],
            settings: { seeded: false, schemaVersion: 1, viewingAs: "admin" }
        };

        Cohere.Storage.saveAll();
        Cohere.UI.showToast("All data reset.", "success");
        Cohere.App.renderAll();
    }

    // Export Data: download the entire state as a JSON file
    function handleExport() {
        const state = window.Cohere.state;
        const payload = {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            organizations: state.organizations,
            members: state.members,
            tasks: state.tasks,
            appointments: state.appointments,
            attendance: state.attendance,
            activity: state.activity,
            notifications: state.notifications,
            settings: state.settings
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cohere-backup-" + Cohere.Utils.todayISO() + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Cohere.Activity.log("settings", "Exported data backup");
        Cohere.Storage.saveAll();
        Cohere.UI.showToast("Backup exported.", "success");
    }

    // Import Backup: read the file, validate, replace state atomically
    function handleImport(e) {
        const input = e.target;
        if (!input || !input.files || !input.files[0]) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onerror = function () {
            Cohere.UI.showToast("Could not read the file.", "error");
            input.value = "";
        };

        reader.onload = function () {
            let data;
            try {
                data = JSON.parse(reader.result);
            } catch (err) {
                Cohere.UI.showToast("Invalid JSON file. Data unchanged.", "error");
                input.value = "";
                return;
            }

            const validationError = validateImport(data);
            if (validationError) {
                Cohere.UI.showToast(validationError + " Data unchanged.", "error");
                input.value = "";
                return;
            }

            if (!Cohere.UI.confirmAction("Importing will replace all current data. Continue?")) {
                input.value = "";
                return;
            }

            // Atomic replace: build a new state object, swap it in, save
            try {
                const newState = {
                    organizations: data.organizations,
                    members: data.members,
                    tasks: data.tasks,
                    appointments: data.appointments,
                    attendance: data.attendance,
                    activity: data.activity,
                    notifications: data.notifications,
                    settings: data.settings && typeof data.settings === "object"
                        ? data.settings
                        : { seeded: true, schemaVersion: 1, viewingAs: "admin" }
                };
                window.Cohere.state = newState;
                Cohere.Storage.saveAll();
                Cohere.Activity.log("settings", "Imported data backup");
                Cohere.Storage.saveAll();
                Cohere.UI.showToast("Backup imported successfully.", "success");
                Cohere.App.renderAll();
            } catch (err) {
                Cohere.UI.showToast("Import failed. Data unchanged.", "error");
                // Best-effort reload from storage
                Cohere.Storage.loadAll();
                Cohere.App.renderAll();
            }

            input.value = "";
        };

        reader.readAsText(file);
    }

    // Validates an imported backup object; returns null if OK, else an error message
    function validateImport(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return "File does not contain a data object.";
        }
        if (data.schemaVersion !== undefined && data.schemaVersion !== 1) {
            return "Unsupported schema version.";
        }
        for (let i = 0; i < COLLECTIONS.length; i++) {
            const key = COLLECTIONS[i];
            if (!Array.isArray(data[key])) {
                return "Missing or invalid \"" + key + "\" collection.";
            }
        }
        return null;
    }

    return { init, render };
})();