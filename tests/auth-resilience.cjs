const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(path, modules) {
    const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    new Function('exports', 'require', output)(exports, name => {
        if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
        return modules[name];
    });
    return exports;
}

function hooks() {
    const slots = [];
    let cursor = 0, pending = [];
    const effect = (fn, deps) => {
        const i = cursor++, old = slots[i];
        if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
            pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
        }
    };
    return {
        slots,
        react: {
            useState(initial) {
                const i = cursor++;
                if (!(i in slots)) slots[i] = initial;
                return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
            },
            useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
            useEffect: effect, useLayoutEffect: effect,
        },
        render(fn) { cursor = 0; fn(); const effects = pending; pending = []; effects.forEach(run => run()); },
        unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    };
}

const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

(async () => {
    let userResult, creatorResult;
    const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => creatorResult };
    const { getCurrentCreator } = load('lib/creator.ts', {
        '@/lib/supabase': { supabase: { auth: { getUser: async () => userResult }, from: () => query } },
    });
    const user = { id: 'creator', identities: [] };
    userResult = { data: { user }, error: null };
    creatorResult = { data: null, error: { message: 'timeout' } };
    assert.equal((await getCurrentCreator()).checkFailed, true);
    assert.equal((await getCurrentCreator()).user, user);
    creatorResult = { data: null, error: null };
    assert.equal((await getCurrentCreator()).checkFailed, undefined);
    assert.equal((await getCurrentCreator()).isCreator, false);
    creatorResult = { data: { is_active: false }, error: null };
    assert.equal((await getCurrentCreator()).isCreator, false);
    creatorResult = { data: { is_active: true, role: 'owner' }, error: null };
    assert.equal((await getCurrentCreator()).isOwner, true);
    userResult = { data: { user: null }, error: { name: 'AuthRetryableFetchError' } };
    assert.equal((await getCurrentCreator()).checkFailed, true);
    userResult = { data: { user: null }, error: { name: 'AuthSessionMissingError' } };
    assert.equal((await getCurrentCreator()).checkFailed, undefined);
    userResult = null; // Unexpected SDK exception must also be treated conservatively.
    assert.equal((await getCurrentCreator()).checkFailed, true);

    const timers = new Map(); let timerId = 0;
    global.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
    global.clearTimeout = id => timers.delete(id);
    const runTimer = async delay => {
        const entry = [...timers].find(([, item]) => item.delay === delay);
        assert.ok(entry, `Expected ${delay}ms timer`);
        timers.delete(entry[0]); entry[1].fn(); await tick();
    };
    global.window = new EventTarget();
    global.document = new EventTarget();
    document.visibilityState = 'visible';
    const state = hooks(), requests = []; let authEvent;
    const active = { user, isCreator: true, isOwner: false };
    const Header = load('components/MainHeader.tsx', {
        react: state.react,
        'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
        'next/link': {}, 'next/navigation': { usePathname: () => '/create' },
        sonner: { toast: {} }, './TypingHeader': {}, './Modal': {},
        '@/lib/auth-diagnostics': { recordAuthEvent() {} },
        '@/lib/creator': { getCurrentCreator: () => { const d = deferred(); requests.push(d); return d.promise; } },
        '@/lib/supabase': { supabase: { auth: {
            onAuthStateChange(fn) { authEvent = fn; return { data: { subscription: { unsubscribe() {} } } }; },
            signOut() { throw new Error('Must not sign out automatically'); },
        } } },
    }).default;
    state.render(Header);
    requests.shift().resolve(active); await tick();
    assert.equal(state.slots[1], active);
    authEvent('TOKEN_REFRESHED'); await runTimer(0);
    requests.shift().resolve({ checkFailed: true }); await tick();
    assert.equal(state.slots[1], active, 'Temporary failure preserves current identity');
    assert.ok(state.slots[5], 'Persistent notice on check failure');
    await runTimer(3000);
    const stale = requests.shift();
    authEvent('SIGNED_OUT');
    stale.resolve(active); await tick();
    assert.equal(state.slots[1], null, 'Stale request cannot restore signed-out identity');
    await runTimer(0);
    requests.shift().resolve({ user: null, isCreator: false }); await tick();
    assert.ok(state.slots[5]);
    authEvent('SIGNED_IN'); await runTimer(0);
    requests.shift().resolve({ user, isCreator: false }); await tick();
    assert.ok(state.slots[5], 'Confirmed denial stays on form without forced sign-out');
    authEvent('TOKEN_REFRESHED'); await runTimer(0);
    requests.shift().resolve({ checkFailed: true }); await tick();
    for (let i = 0; i < 2; i++) {
        await runTimer(3000);
        requests.shift().resolve({ checkFailed: true }); await tick();
    }
    assert.equal(timers.size, 0, 'Retries must stop after two attempts');
    authEvent('TOKEN_REFRESHED'); await runTimer(0);
    const afterUnmount = requests.shift(); state.unmount();
    afterUnmount.resolve(active); await tick();
    assert.equal(state.slots[1].isCreator, false);

    timers.clear();
    const draftState = hooks(), saved = new Map(); let warnings = 0;
    global.localStorage = { setItem: (key, value) => saved.set(key, value) };
    const { useTemplateDraft } = load('lib/use-template-draft.ts', {
        react: draftState.react, sonner: { toast: { error() { warnings++; } } },
    });
    const skip = { current: false };
    const renderDraft = (value, enabled = true) => draftState.render(() => useTemplateDraft('draft', value, enabled, skip));
    renderDraft({ title: '' }, false);
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(saved.size, 0, 'Loading form must not overwrite restored draft');
    renderDraft({ title: 'Latest unsaved input' });
    window.dispatchEvent(new Event('zzzcode-save-draft'));
    assert.equal(JSON.parse(saved.get('draft')).title, 'Latest unsaved input');
    renderDraft({ title: 'Before background' });
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(JSON.parse(saved.get('draft')).title, 'Before background');
    renderDraft({ title: 'Before unmount' }); draftState.unmount();
    assert.equal(JSON.parse(saved.get('draft')).title, 'Before unmount');
    const clearedState = hooks();
    const clearedHook = load('lib/use-template-draft.ts', { react: clearedState.react, sonner: { toast: { error() { warnings++; } } } }).useTemplateDraft;
    clearedState.render(() => clearedHook('draft', { title: 'Saved successfully' }, true, skip));
    skip.current = true; saved.delete('draft'); clearedState.unmount();
    assert.equal(saved.size, 0, 'Success/clear must not recreate the draft on unmount');
    assert.equal(warnings, 0);
    const failingState = hooks();
    const failingHook = load('lib/use-template-draft.ts', { react: failingState.react, sonner: { toast: { error() { warnings++; } } } }).useTemplateDraft;
    localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    failingState.render(() => failingHook('draft', { title: 'Important work' }, true, { current: false }));
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(warnings, 1, 'Storage failures must be visible without crashing');
    failingState.unmount();
    global.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const { recordAuthEvent } = load('lib/auth-diagnostics.ts', {});
    for (let i = 0; i < 40; i++) recordAuthEvent('TOKEN_REFRESHED');
    const events = JSON.parse(saved.get('zzzcode_auth_events'));
    assert.equal(events.length, 30);
    assert.deepEqual(Object.keys(events[0]), ['time', 'event']);
    console.log('Auth failures, denied access, stale responses and draft flush regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
