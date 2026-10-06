const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Deterministic hook storage and timers exercise transitions without real delays.
const slots = [], timers = new Map();
let cursor = 0, serial = 0;
const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], next => { slots[index] = next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { return fn; }, useEffect() {},
};
const loaded = {};
new Function('exports', 'require', 'setTimeout', 'clearTimeout', ts.transpileModule(fs.readFileSync('lib/use-undoable-state.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded, () => react, fn => { timers.set(++serial, fn); return serial; }, id => timers.delete(id));
const render = () => { cursor = 0; return loaded.useUndoableState({ text: 'start', order: ['a', 'b'] }); };
let hook = render();
hook.setValue(prev => ({ ...prev, text: 'one' }));
hook.setValue(prev => ({ ...prev, text: prev.text + ' two' }));
hook = render();
assert.equal(hook.value.text, 'one two');
hook.transact(prev => ({ ...prev, order: ['b', 'a'] }));
hook = render();
assert.equal(timers.size, 0);
hook.undo(); hook = render();
assert.deepEqual(hook.value, { text: 'one two', order: ['a', 'b'] });
hook.undo(); hook = render();
assert.equal(hook.value.text, 'start');
assert.equal(hook.canUndo, false);
hook.redo(); hook.redo(); hook = render();
assert.deepEqual(hook.value, { text: 'one two', order: ['b', 'a'] });
assert.equal(hook.canRedo, false);
hook.setValue(prev => ({ ...prev, text: 'after' }));
for (const fn of [...timers.values()]) fn(); timers.clear();
hook = render(); hook.undo(); hook = render();
assert.equal(hook.value.text, 'one two');
hook.setValue(prev => prev); hook = render();
assert.equal(hook.canRedo, true, 'No-op does not discard redo');
hook.reset({ text: 'other draft', order: [] });
hook = render();
assert.equal(hook.canUndo, false); assert.equal(hook.canRedo, false);
for (let i = 0; i < 60; i++) hook.transact(prev => ({ ...prev, text: String(i) }));
for (let i = 0; i < 50; i++) hook.undo();
hook = render();
assert.equal(hook.value.text, '9'); assert.equal(hook.canUndo, false);
console.log('PASS: grouped typing, atomic reorder, immediate undo/redo, timer commit, reset and history limit');
