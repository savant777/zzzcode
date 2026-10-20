const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let calls = 0, profileCalls = 0, authChanged;
const waiting = [];
global.window = {};
const supabase = {
    auth: {
        onAuthStateChange(fn) { authChanged = fn; },
        getUser() { calls++; const request = deferred(); waiting.push(request); return request.promise; },
    },
    from() { return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { profileCalls++; return { data: { is_active: true, role: 'creator' }, error: null }; },
    }; },
};
const exportsObject = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('lib/creator.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(exportsObject, () => ({ supabase }));
const { getCurrentCreator, getCreatorForDisplay } = exportsObject;
const signedIn = { data: { user: { id: 'one', identities: [] } }, error: null };
const signedOut = { data: { user: null }, error: null };
(async () => {
    const header = getCurrentCreator(), dashboard = getCurrentCreator();
    assert.equal(header, dashboard);
    assert.equal(calls, 1);
    waiting.shift().resolve(signedIn);
    assert.equal((await header).isCreator, true);
    assert.equal(profileCalls, 1);
    const fresh = getCurrentCreator();
    assert.equal(calls, 2, 'Completed checks are not cached');
    waiting.shift().resolve(signedOut); await fresh;
    const old = getCurrentCreator();
    const oldRequest = waiting.shift();
    authChanged('SIGNED_OUT');
    const current = getCurrentCreator();
    assert.equal(calls, 4);
    oldRequest.resolve(signedIn);
    // The stale result must join the new check, rather than restore the old user.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    waiting.shift().resolve(signedOut);
    assert.equal((await old).user, null);
    assert.equal((await current).user, null);
    const failed = getCurrentCreator();
    waiting.shift().resolve({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } });
    assert.equal((await failed).checkFailed, true);
    const retry = getCurrentCreator();
    waiting.shift().resolve(signedIn);
    assert.equal((await retry).isCreator, true);
    let sessionCalls = 0;
    supabase.auth.getSession = async () => {
        sessionCalls++;
        return { data: { session: { user: signedIn.data.user } }, error: null };
    };
    const verifiedCalls = calls;
    authChanged('SIGNED_IN', { user: signedIn.data.user });
    const displayHeader = getCreatorForDisplay(), displayDashboard = getCreatorForDisplay();
    assert.equal(displayHeader, displayDashboard, 'Display callers share one request');
    await Promise.resolve();
    authChanged('SIGNED_IN', { user: signedIn.data.user });
    authChanged('TOKEN_REFRESHED', { user: signedIn.data.user });
    assert.equal(getCreatorForDisplay(), displayHeader, 'Same-account auth events preserve an in-flight check');
    assert.equal((await displayHeader).isCreator, true);
    await getCreatorForDisplay();
    assert.equal(sessionCalls, 1, 'Navigation reuses the recent display result');
    authChanged('SIGNED_IN', { user: signedIn.data.user });
    authChanged('TOKEN_REFRESHED', { user: signedIn.data.user });
    await getCreatorForDisplay();
    assert.equal(sessionCalls, 1, 'Same-account events preserve completed display results');
    assert.equal(calls, verifiedCalls, 'Display does not make a getUser network request');
    authChanged('INITIAL_SESSION', { user: signedIn.data.user });
    await getCreatorForDisplay();
    assert.equal(sessionCalls, 1);
    const originalNow = Date.now;
    try {
        const later = originalNow() + 31_000;
        Date.now = () => later;
        await getCreatorForDisplay();
        assert.equal(sessionCalls, 2, 'Expired display results are checked again');
    } finally { Date.now = originalNow; }
    authChanged('SIGNED_OUT');
    supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
    assert.equal((await getCreatorForDisplay()).user, null, 'Sign-out clears the display cache');
    authChanged('SIGNED_IN', { user: signedIn.data.user });
    let local = deferred();
    supabase.auth.getSession = () => local.promise;
    const staleDisplay = getCreatorForDisplay();
    authChanged('SIGNED_OUT');
    supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
    local.resolve({ data: { session: { user: signedIn.data.user } }, error: null });
    assert.equal((await staleDisplay).user, null, 'An old display check cannot restore signed-out identity');
    authChanged('USER_UPDATED');
    supabase.auth.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } });
    assert.equal((await getCreatorForDisplay()).checkFailed, true);
    supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
    assert.equal((await getCreatorForDisplay()).checkFailed, undefined, 'Failed display checks are not cached');
    console.log('Concurrent checks share requests; completed, failed and changed sessions are rechecked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
