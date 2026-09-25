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
const { getCurrentCreator } = exportsObject;
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
    console.log('Concurrent checks share requests; completed, failed and changed sessions are rechecked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
