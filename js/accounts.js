window.Cohere = window.Cohere || {};
/*
 * Account logic. The accounts themselves live in js/accounts-data.js.
 * Accounts created inside the app (a President assigned by the Admin, members
 * added by a President) are saved in this browser and layered on top of that file.
 */
Cohere.Accounts = (function () {
    "use strict";

    const ADMIN_ROLE = "Admin";
    const SESSION_KEY = "cohere.session";
    const STORE_KEY = "cohere.v1.accounts";

    function norm(v) { return String(v || "").trim().toLowerCase(); }

    // ---- Storage ------------------------------------------------------------
    function loadStored() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
    }
    function saveStored(list) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
    }
    function clearStored() {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    }

    // Base accounts (file) overridden / extended by saved ones, matched by username.
    // Includes disabled accounts (removed members); use getActive() for logins.
    function getAll() {
        const map = {};
        const order = [];
        (Cohere.AccountData || []).concat(loadStored()).forEach(function (a) {
            if (!(a.username in map)) order.push(a.username);
            map[a.username] = a;
        });
        return order.map(function (u) { return map[u]; });
    }
    function getActive() { return getAll().filter(function (a) { return !a.disabled; }); }

    function upsertStored(account) {
        const list = loadStored().filter(function (a) { return a.username !== account.username; });
        list.push(account);
        return saveStored(list);
    }

    // ---- Lookup / login -----------------------------------------------------
    function authenticate(identifier, password) {
        const id = norm(identifier);
        if (!id || !password) return null;
        const acc = getActive().find(function (a) {
            return norm(a.username) === id || norm(a.email) === id || norm(a.studentId) === id;
        });
        return acc && acc.password === password ? acc : null;
    }

    function findByUsername(username) {
        return getActive().find(function (a) { return a.username === username; }) || null;
    }

    function isAdmin(account) { return !!account && account.role === ADMIN_ROLE; }

    // The member record an account belongs to
    function findMember(account) {
        if (!account || isAdmin(account)) return null;
        const members = (Cohere.state && Cohere.state.members) || [];
        return members.find(function (m) {
            if (account.memberId) return m.id === account.memberId;
            return (account.email && norm(m.email) === norm(account.email)) ||
                (account.studentId && norm(m.studentId) === norm(account.studentId));
        }) || null;
    }

    // Every membership (member record) of the person behind an account. A person who belongs
    // to several organizations has one member record per organization, sharing a student ID.
    function findMemberships(account) {
        if (!account || isAdmin(account)) return [];
        const members = (Cohere.state && Cohere.state.members) || [];
        return members.filter(function (m) {
            return (account.memberId && m.id === account.memberId) ||
                (account.studentId && norm(m.studentId) === norm(account.studentId)) ||
                (account.email && m.email && norm(m.email) === norm(account.email));
        });
    }

    // The account that belongs to a member record (if any). Another membership of the same
    // person (same student ID or email) resolves to the same account.
    function findForMember(member) {
        if (!member) return null;
        const accounts = getActive().filter(function (a) { return !isAdmin(a); });
        return accounts.find(function (a) { return a.memberId === member.id; }) ||
            accounts.find(function (a) {
                return (a.email && member.email && norm(a.email) === norm(member.email)) ||
                    (a.studentId && norm(a.studentId) === norm(member.studentId));
            }) || null;
    }

    // ---- Keeping accounts in step with members ------------------------------
    function uniqueUsername(base) {
        const taken = {};
        getAll().forEach(function (a) { taken[norm(a.username)] = true; });
        let name = norm(base) || "user";
        let n = 2;
        const root = name;
        while (taken[name]) { name = root + n++; }
        return name;
    }

    // Creates or updates the account of a member. `existing` is the account found
    // BEFORE the member was edited. Returns { account, created }.
    function syncMember(member, existing) {
        const org = Cohere.Store.getOrg(member.orgId);
        const fields = {
            name: member.fullName, role: member.role, org: org ? org.name : "",
            email: member.email || "", studentId: member.studentId, memberId: member.id
        };
        if (existing) {
            // Another membership of a person who already has an account: the account keeps the role,
            // organization and member record it was created with. Only the shared details are updated.
            const members = (Cohere.state && Cohere.state.members) || [];
            const isOtherMembership = !!existing.memberId && existing.memberId !== member.id &&
                members.some(function (m) { return m.id === existing.memberId; });
            if (isOtherMembership) {
                const shared = Object.assign({}, existing, {
                    name: member.fullName, email: member.email || existing.email || "", studentId: member.studentId
                });
                upsertStored(shared);
                return { account: shared, created: false };
            }
            const updated = Object.assign({}, existing, fields);
            upsertStored(updated);
            return { account: updated, created: false };
        }
        const created = Object.assign({
            username: uniqueUsername(member.studentId),
            password: member.studentId      // default password = student ID
        }, fields);
        upsertStored(created);
        return { account: created, created: true };
    }

    // Disables the login of a removed member
    function removeForMember(member) {
        const acc = findForMember(member);
        if (!acc) return;
        // Still a member of another organization: the login stays
        const members = (Cohere.state && Cohere.state.members) || [];
        const otherMembership = members.some(function (m) {
            return m.id !== member.id && norm(m.studentId) === norm(member.studentId);
        });
        if (otherMembership) return;
        const inFile = (Cohere.AccountData || []).some(function (a) { return a.username === acc.username; });
        const list = loadStored().filter(function (a) { return a.username !== acc.username; });
        if (inFile) list.push({ username: acc.username, disabled: true });
        saveStored(list);
    }

    // Keeps the organization name on accounts in step when an organization is renamed
    function renameOrg(oldName, newName) {
        getActive().forEach(function (a) {
            if (a.org && norm(a.org) === norm(oldName)) upsertStored(Object.assign({}, a, { org: newName }));
        });
    }

    // ---- Export: builds a replacement for js/accounts-data.js ---------------
    function exportSource() {
        const rows = getActive().map(function (a) {
            const o = { username: a.username, password: a.password, name: a.name, role: a.role };
            if (a.org) o.org = a.org;
            if (a.email) o.email = a.email;
            if (a.studentId) o.studentId = a.studentId;
            return "    " + JSON.stringify(o);
        });
        return "window.Cohere = window.Cohere || {};\n" +
            "// Exported " + new Date().toISOString() + ". Replace js/accounts-data.js with this file.\n" +
            "// Roles: Admin, President, Executive, Member. Passwords are visible to anyone who opens the site.\n" +
            "Cohere.AccountData = [\n" + rows.join(",\n") + "\n];\n";
    }

    // ---- Session: only the username is remembered (per browser tab) ---------
    function getSession() {
        try { return findByUsername(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
    }
    function setSession(username) {
        try { sessionStorage.setItem(SESSION_KEY, username); } catch (e) { /* ignore */ }
    }
    function clearSession() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }

    return {
        ADMIN_ROLE, authenticate, findByUsername, findMember, findMemberships, findForMember, isAdmin,
        syncMember, removeForMember, renameOrg, clearStored, exportSource,
        getSession, setSession, clearSession
    };
})();
