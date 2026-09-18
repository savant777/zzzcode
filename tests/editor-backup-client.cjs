const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const loaded = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync('lib/editor-backup-client.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded.exports, require, loaded);
const api = loaded.exports;
const data = new Map();
const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
const payload = { activeDraftId: 'a', drafts: [{ id: 'a', name: 'A', updatedAt: '2026-09-18T00:00:00Z', fieldValues: { text: 'first' } }] };
const connection = { id: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(43), templateId: '1', revision: 1, updatedAt: '2026-09-18T01:00:00Z', savedPayload: payload };
async function run() {
    const keys = [];
    let fail = true;
    global.fetch = async (url, options) => {
        keys.push(options.headers['Idempotency-Key']);
        if (fail) throw new Error('Connection lost after server created backup');
        return Response.json({ ...connection, payload });
    };
    await assert.rejects(api.createBackup(storage, '1', payload));
    fail = false;
    await api.createBackup(storage, '1', payload);
    assert.equal(keys[0], keys[1], 'Retry after a lost response must not create another backup');
    assert.equal(keys[0].length, 43);
    api.persistConnection(storage, connection);
    assert.deepEqual(api.readConnection(storage, '1'), connection);
    assert.equal(api.readConnection(storage, '2'), null);
    const changedTime = structuredClone(payload);
    changedTime.drafts[0].updatedAt = '2026-09-19T01:00:00Z';
    assert.equal(api.sameBackupContent(payload, changedTime), true);
    changedTime.drafts[0].fieldValues.text = 'changed';
    assert.equal(api.sameBackupContent(payload, changedTime), false);
    assert.equal(new URL(api.backupLink('http://localhost:3000', connection)).search, '');
    assert.deepEqual(api.parseBackupLink(new URL(api.backupLink('http://localhost:3000', connection)).hash, '1'), {
        id: connection.id, token: connection.token, templateId: '1',
    });
    assert.equal(api.parseBackupLink('', '1'), null);
    assert.throws(() => api.parseBackupLink('#backup=invalid', '1'));
    assert.equal(api.backupOpenAction(false, null, null, connection), 'load');
    assert.equal(api.backupOpenAction(true, null, null, connection), 'confirm', 'Unreadable local work must not be silently replaced');
    assert.equal(api.backupOpenAction(true, changedTime, connection, connection), 'keep', 'Unsaved work on same revision survives re-entry');
    const newer = { ...connection, revision: 2, savedPayload: changedTime };
    assert.equal(api.backupOpenAction(true, payload, connection, newer), 'load', 'Clean local copy follows online updates');
    const otherWork = structuredClone(payload);
    otherWork.drafts[0].name = 'Unsent local rename';
    assert.equal(api.backupOpenAction(true, otherWork, connection, newer), 'confirm');
    assert.equal(api.backupOpenAction(true, otherWork, null, newer), 'confirm');
    assert.equal(api.backupOpenAction(true, otherWork, connection, { ...newer, id: 'another' }), 'confirm');
    global.fetch = async (url, options) => {
        assert.equal(options.headers.Authorization, `Bearer ${connection.token}`);
        assert.equal(JSON.parse(options.body).expectedRevision, 7);
        return Response.json({ status: 'conflict', revision: 8 }, { status: 409 });
    };
    await assert.rejects(api.updateBackup(connection, payload, 7), error => error instanceof api.BackupRequestError && error.revision === 8);
    // Regression: KEEP & LOAD advances the known revision, but restoring a local
    // copy must still prompt instead of blindly saving against that new revision.
    const restored = { ...connection, revision: 8, requiresOverwriteConfirmation: true };
    api.persistConnection(storage, restored);
    const reopened = api.readConnection(storage, '1');
    assert.equal(reopened.requiresOverwriteConfirmation, true);
    assert.equal(api.backupOpenAction(true, payload, reopened, { ...connection, revision: 8 }), 'keep');
    const methods = [];
    global.fetch = async (url, options) => {
        methods.push(options.method);
        if (options.method === 'GET') return Response.json({ ...connection, revision: 8, payload });
        assert.equal(JSON.parse(options.body).expectedRevision, 8);
        return Response.json({ status: 'saved', id: connection.id, revision: 9, updatedAt: connection.updatedAt });
    };
    await assert.rejects(api.updateBackup(reopened, changedTime), error => error.status === 409 && error.revision === 8);
    assert.deepEqual(methods, ['GET'], 'Restored copy must not write until confirmed');
    await api.updateBackup(reopened, changedTime, 8);
    assert.deepEqual(methods, ['GET', 'PUT']);
    console.log('PASS: persistent retry key, persistent connection, content status, fragment link and explicit revision conflict');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
