window.Cohere = window.Cohere || {};
Cohere.Permissions = (function () {
    "use strict";

    // The signed-in account (from js/accounts-data.js or created in the app).
    // There is no way to switch account or role without signing out and logging in again.
    let account = null;

    function init() { account = Cohere.Accounts.getSession(); }

    function signIn(acc) {
        account = acc;
        Cohere.Accounts.setSession(acc.username);
    }

    function signOut() {
        account = null;
        Cohere.Accounts.clearSession();
    }

    function isSignedIn() { return !!account; }

    // Shows who is signed in (read-only) in the header
    function renderUser() {
        const el = document.getElementById("user-name");
        if (!el) return;
        const actor = getActor();
        el.textContent = actor.isAdmin ? actor.name : actor.name + " · " + actor.role;
    }

    // The role always comes from the account, never from the editable member list.
    function getActor() {
        if (!account) return { id: null, name: "Guest", role: "", position: "", orgId: null, isAdmin: false };
        if (Cohere.Accounts.isAdmin(account)) {
            return { id: "admin", name: account.name, role: "Admin", position: "Admin", orgId: null, isAdmin: true };
        }
        const member = Cohere.Accounts.findMember(account);
        let orgId = member ? member.orgId : null;
        if (!orgId && account.org) {
            const org = Cohere.state.organizations.find(function (o) {
                return o.name.toLowerCase() === String(account.org).toLowerCase();
            });
            orgId = org ? org.id : null;
        }
        return {
            id: member ? member.id : account.username,
            name: member ? member.fullName : account.name,
            role: account.role,
            position: member && member.position ? member.position : account.role,
            orgId: orgId,
            isAdmin: false
        };
    }

    function can(action) {
        const actor = getActor();
        if (actor.isAdmin) return true;
        if (!account) return false;
        return (Cohere.Config.PERMISSIONS[actor.role] || []).includes(action);
    }

    // Admin: any organization. Everyone else: only data that belongs to their own organization.
    function canManageOrgData(orgId) {
        const actor = getActor();
        return actor.isAdmin || (!!orgId && actor.orgId === orgId);
    }

    // Edit / delete / complete a task (only tasks of your own organization)
    function canUpdateTask(task) {
        return can("manageTasks") && canManageOrgData(Cohere.Store.taskOrgId(task));
    }

    // Edit / cancel / delete a meeting (only meetings of your own organization)
    function canManageMeeting(appt) {
        return can("manageMeetings") && canManageOrgData(Cohere.Store.apptOrgId(appt));
    }

    function canMarkAttendance(appt) {
        return can("markAttendance") && canManageOrgData(Cohere.Store.apptOrgId(appt));
    }

    // Admin: any organization. President: only their own organization.
    function canManageOrgMembers(orgId) {
        if (!can("manageMembers")) return false;
        const actor = getActor();
        return actor.isAdmin || (!!orgId && actor.orgId === orgId);
    }

    // Presidents cannot edit or remove the President (only the Admin can).
    function canManageMember(member) {
        if (!member || !canManageOrgMembers(member.orgId)) return false;
        return getActor().isAdmin || member.role !== "President";
    }

    function denyMessage(action) {
        const actor = getActor();
        const label = Cohere.Config.ACTION_LABELS[action] || action;
        return "Signed in as " + actor.name + " (" + (actor.role || "Guest") + "): you do not have permission to " + label + ".";
    }

    return { init, signIn, signOut, isSignedIn, renderUser, getActor, can, canManageOrgData, canUpdateTask, canManageMeeting, canMarkAttendance, canManageOrgMembers, canManageMember, denyMessage };
})();
