const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('components/TemplateDashboard.tsx', 'utf8');
const ts = require('typescript');
const body = source.slice(source.indexOf('const handleOpenPrivate ='), source.indexOf('const handleUnlockPrivate ='));
const build = new Function('getRememberedTemplateUnlock', 'router', 'templateRoute', 'activeFilter',
    'setSelectedItem', 'setPassword', 'setModalType',
    ts.transpileModule(body + '\nreturn handleOpenPrivate;', {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText);
(async () => {
    const urls = [], states = [];
    let credential = 'remembered';
    const open = build(async () => credential, { push: url => urls.push(url) },
        () => ({ group: 'commission', tag: 'abeioty' }), 'commission:abeioty',
        item => states.push(item), value => states.push(value), value => states.push(value));
    const item = { id: 142, template_tags: [] };
    await open(item);
    assert.deepEqual(urls, ['/editor/142?group=commission&tag=abeioty']);
    assert.deepEqual(states, [], 'Remembered access goes directly to the protected editor read');
    credential = null;
    await open(item);
    assert.equal(urls.length, 1);
    assert.deepEqual(states, [item, '', 'private'], 'Missing credentials still open the password prompt');
    console.log('Remembered template entry skips unlock preflight; missing credentials prompt for password.');
})().catch(error => { console.error(error); process.exitCode = 1; });
