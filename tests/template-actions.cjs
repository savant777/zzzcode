const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('lib/template-actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleUnderTest = { exports: {} };
new Function('exports', 'module', output)(moduleUnderTest.exports, moduleUnderTest);
const { deactivateTemplate, setTemplateActive } = moduleUnderTest.exports;
function db(result, active = false) {
    return { from(table) {
        assert.equal(table, 'templates');
        return { update(values) {
            assert.deepEqual(values, { is_active: active });
            return { eq(column, id) {
                assert.equal(column, 'id');
                assert.equal(id, 42);
                return { select(columns) {
                    assert.equal(columns, 'id, is_active');
                    return { single: async () => result };
                } };
            } };
        } };
    } };
}
async function main() {
    await deactivateTemplate(db({ data: { id: 42, is_active: false }, error: null }), 42);
    await setTemplateActive(db({ data: { id: 42, is_active: true }, error: null }, true), 42, true);
    await assert.rejects(setTemplateActive(db({ data: { id: 42, is_active: false }, error: null }, true), 42, true));
    await assert.rejects(setTemplateActive(db({ data: null, error: { message: 'RLS denied' } }, true), 42, true), /RLS denied/);
    for (const data of [null, { id: 42, is_active: true }, { id: 43, is_active: false }]) {
        await assert.rejects(deactivateTemplate(db({ data, error: null }), 42));
    }
    await assert.rejects(deactivateTemplate(db({ data: null, error: { message: 'RLS denied' } }), 42), /RLS denied/);
    await assert.rejects(deactivateTemplate({ from() { throw new Error('offline'); } }, 42), /offline/);
    console.log('Template deactivation confirms the changed row and rejects failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
