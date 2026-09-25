const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('lib/template-unlock.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function load() {
    const module = { exports: {} };
    new Function('exports', 'module', output)(module.exports, module);
    return module.exports;
}
function storage() {
    const entries = new Map();
    return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
async function main() {
    const expected = (id, password) => require('node:crypto').createHash('sha256').update(JSON.stringify([id, password])).digest('hex');
    const matches = async (id, password) => typeof password === 'string' && await unlock.getRememberedTemplateUnlock(id) === expected(id, password);
    const disk = storage();
    global.window = { localStorage: disk, sessionStorage: storage() };
    let unlock = load();
    assert.equal(await matches('1', 'secret'), false);
    assert.equal(await unlock.rememberTemplateUnlock('1', 'secret'), true);
    assert.equal(await matches('1', 'secret'), true);
    // Simulate closing and reopening the browser: keep local storage only.
    window.sessionStorage = storage();
    unlock = load();
    assert.equal(await matches('1', 'secret'), true);
    assert.equal(await matches('2', 'secret'), false);
    assert.equal(await matches('1', 'changed'), false);
    assert.equal(await matches('1', null), false);
    assert.equal(await unlock.rememberTemplateUnlock('1', 'changed'), true);
    unlock = load();
    assert.equal(await matches('1', 'changed'), true);
    assert.equal(await matches('1', 'secret'), false);
    assert.ok([...disk.entries.values()].every(value => /^[a-f0-9]{64}$/.test(value)));
    // Legacy boolean flags cannot validate the current password.
    window.sessionStorage.setItem('unlocked_3', 'true');
    assert.equal(await matches('3', 'secret'), false);
    disk.setItem('zzzcode_template_unlock_v1_3', '{broken');
    assert.equal(await matches('3', 'secret'), false);
    // A blocked localStorage getter falls back to the tab session.
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.equal(await unlock.rememberTemplateUnlock('4', 'secret'), false);
    unlock = load();
    assert.equal(await matches('4', 'secret'), true);
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.equal(await unlock.rememberTemplateUnlock('5', 'secret'), false);
    assert.equal(await matches('5', 'secret'), true);
    assert.equal(await matches('5', 'changed'), false);
    assert.equal(await matches('6', 'secret'), false);
    console.log('Template unlock persistence, password changes, isolation and blocked storage passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
