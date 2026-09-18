const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/editor-local-copy.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { saveLocalCopy, readLocalCopy, localCopyKey } = loaded.exports;
const data = new Map();
const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
const stamp = '2026-09-18T10:00:00.000Z';
const drafts = [
    { id: 'a', name: 'One', fieldValues: { text: 'old' }, updatedAt: stamp },
    { id: 'b', name: 'Two', fieldValues: { rows: [{ text: 'nested' }] }, updatedAt: stamp },
];
const latest = { text: 'typed before autosave' };
saveLocalCopy(storage, '117', null, drafts, 'a', latest);
latest.text = 'later edit';
drafts[1].fieldValues.rows[0].text = 'later nested edit';
let copy = readLocalCopy(storage, '117');
assert.equal(copy.drafts[0].fieldValues.text, 'typed before autosave');
assert.equal(copy.drafts[1].fieldValues.rows[0].text, 'nested');
assert.equal(copy.activeDraftId, 'a');
// A fresh storage wrapper models reading after reloading, without in-memory state.
assert.deepEqual(readLocalCopy({ ...storage }, '117'), copy);
saveLocalCopy(storage, '117', null, [drafts[1]], 'b', { text: 'latest snapshot' });
copy = readLocalCopy(storage, '117');
assert.equal(data.size, 1);
assert.equal(copy.drafts.length, 1);
assert.equal(copy.activeDraftId, 'b');
assert.equal(copy.drafts[0].fieldValues.text, 'latest snapshot');
assert.equal(readLocalCopy(storage, '118'), null);
assert.equal(readLocalCopy(storage, '117', 'another-backup'), null);
saveLocalCopy(storage, '117', 'another-backup', drafts, 'a', {});
assert.equal(readLocalCopy(storage, '117').activeDraftId, 'b');
assert.equal(readLocalCopy(storage, '117', 'another-backup').activeDraftId, 'a');
const beforeFailure = storage.getItem(localCopyKey('117'));
assert.throws(() => saveLocalCopy({ ...storage, setItem() { throw new Error('Quota exceeded'); } }, '117', null, drafts, 'a', {}));
assert.equal(storage.getItem(localCopyKey('117')), beforeFailure);
assert.throws(() => saveLocalCopy(storage, '117', null, drafts, 'missing', {}));
assert.equal(storage.getItem(localCopyKey('117')), beforeFailure);
for (const invalid of ['{bad json', JSON.stringify({ ...copy, templateId: '118' }),
    JSON.stringify({ ...copy, activeDraftId: 'missing' }),
    JSON.stringify({ ...copy, drafts: [copy.drafts[0], copy.drafts[0]] }),
    JSON.stringify({ ...copy, drafts: [{ ...copy.drafts[0], fieldValues: null }] })]) {
    storage.setItem(localCopyKey('117'), invalid);
    assert.throws(() => readLocalCopy(storage, '117'));
    assert.equal(storage.getItem(localCopyKey('117')), invalid, 'Invalid copies must not be silently deleted');
}
console.log('PASS: complete snapshots, fresh reads, overwrite, isolation, quota failures and invalid data');
