window.Cohere = window.Cohere || {};
Cohere.Permissions = (function () {
    "use strict";

    // The signed-in account (from js/accounts-data.js or created in the app).
    // There is no way to switch account or role without signing out and logging in again.
    let account = null;

    // The organization the person is currently working in (chosen in the header). Remembered per
    // browser tab, like the session. A person can belong to several organizations, with a
    // different role in each; Admin can look at any organization.
    const ACTIVE_ORG_KEY = "cohere.activeOrg";
    function storedActiveOrg() { try { return sessionStorage.getItem(ACTIVE_ORG_KEY) || ""; } catch (e) { return ""; } }
    function storeActiveOrg(id) { try { sessionStorage.setItem(ACTIVE_ORG_KEY, id || ""); } catch (e) { /* ignore */ } }

    function init() { account = Cohere.Accounts.getSession(); }

    function signIn(acc) {
        account = acc;
        storeActiveOrg("");
        Cohere.Accounts.setSession(acc.username);
    }

    function signOut() {
        account = null;
        storeActiveOrg("");
        Cohere.Accounts.clearSession();
    }

    function isSignedIn() { return !!account; }

    // The signed-in person's active (not deactivated) memberships, one per organization
    function getMemberships() {
        if (!account || Cohere.Accounts.isAdmin(account)) return [];
        return Cohere.Accounts.findMemberships(account).filter(function (m) {
            return m.status !== "Inactive" && Cohere.Store.getOrg(m.orgId);
        });
    }

    // Organizations the person can switch between: Admin sees all, everyone else the ones they belong to
    function getAvailableOrgs() {
        if (!account) return [];
        const orgs = Cohere.state.organizations;
        if (Cohere.Accounts.isAdmin(account)) return orgs;
        const ids = getMemberships().map(function (m) { return m.orgId; });
        if (ids.length) return orgs.filter(function (o) { return ids.indexOf(o.id) !== -1; });
        // Account without a member record: fall back to the organization name on the account
        const byName = account.org ? orgs.filter(function (o) { return o.name.toLowerCase() === String(account.org).toLowerCase(); }) : [];
        return byName;
    }

    function getActiveOrgId() {
        const orgs = getAvailableOrgs();
        const saved = storedActiveOrg();
        if (saved && orgs.some(function (o) { return o.id === saved; })) return saved;
        return orgs.length ? orgs[0].id : "";
    }

    // Switches the organization being worked in. Returns false if the person is not part of it.
    function setActiveOrg(id) {
        if (!getAvailableOrgs().some(function (o) { return o.id === id; })) return false;
        storeActiveOrg(id);
        return true;
    }

    // The role always comes from the person's membership in the active organization,
    // never from the editable member list's other organizations.
    function getActor() {
        if (!account) return { id: null, memberIds: [], name: "Guest", role: "", position: "", orgId: null, activeOrgId: "", isAdmin: false };
        if (Cohere.Accounts.isAdmin(account)) {
            return { id: "admin", memberIds: [], name: account.name, role: "Admin", position: "Admin", orgId: null, activeOrgId: getActiveOrgId(), isAdmin: true };
        }
        const memberships = getMemberships();
        const orgId = getActiveOrgId() || null;
        const member = memberships.find(function (m) { return m.orgId === orgId; }) || memberships[0] || null;
        return {
            id: member ? member.id : account.username,
            memberIds: memberships.map(function (m) { return m.id; }),
            name: member ? member.fullName : account.name,
            role: member ? member.role : account.role,
            position: member && member.position ? member.position : account.role,
            orgId: orgId,
            activeOrgId: orgId || "",
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

    // Organization picture: the Admin (any organization) or the President of that organization.
    function canEditOrgPicture(orgId) {
        if (!orgId) return false;
        const actor = getActor();
        if (actor.isAdmin) return true;
        return actor.role === "President" && actor.orgId === orgId;
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

    return { init, signIn, signOut, isSignedIn, getMemberships, getAvailableOrgs, getActiveOrgId, setActiveOrg, getActor, can, canManageOrgData, canUpdateTask, canManageMeeting, canMarkAttendance, canManageOrgMembers, canEditOrgPicture, canManageMember, denyMessage };
})();
