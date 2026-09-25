const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(source, dependencies = {}) {
    const exports = {};
    new Function('exports', 'require', ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(exports, name => dependencies[name]);
    return exports;
}
const load = path => compile(fs.readFileSync(path, 'utf8'));
const { defaultBlockCount } = load('lib/block-defaults.ts');
const heights = load('lib/bbcode-height.ts');
const colors = load('lib/colors.ts');
const parser = compile(fs.readFileSync('lib/template-parser.ts', 'utf8'), { './colors': colors });
const { getDefaultValue } = compile(fs.readFileSync('lib/field-defaults.ts', 'utf8'), { './template-parser': parser });
const source = fs.readFileSync('app/editor/[id]/page.tsx', 'utf8');
const helpers = source.slice(source.indexOf('const createBlockEntry ='), source.indexOf('export default function EditorPage'));
const exported = {};
new Function('exports', 'BBCODE_HEIGHTS', 'getBBCodeHeights', 'getDefaultValue', 'defaultBlockCount', ts.transpileModule(
    helpers + '\nexport { createBlockEntry, buildInitialValues };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText)(exported, heights.BBCODE_HEIGHTS, heights.getBBCodeHeights, getDefaultValue, defaultBlockCount);
const field = { id: 'a', variable_name: 'text', block_name: 'items', type: 'text', default_value: 'Hello' };
for (let count = 0; count <= 10; count++) {
    const fields = [{ ...field, block_default_count: count }];
    const values = exported.buildInitialValues(fields);
    assert.equal(values.items.length, count);
    assert.equal(parser.generateFinalHTML('[BLOCK:items]{{text}}[/BLOCK:items]', values, fields), 'Hello'.repeat(count));
}
assert.equal(defaultBlockCount([field]), 1);
assert.equal(defaultBlockCount([{ ...field, block_default_count: -2 }]), 0);
assert.equal(defaultBlockCount([{ ...field, block_default_count: 40 }]), 10);
const fields = [{ ...field, block_default_count: 2 },
    { ...field, block_name: 'nested', parent_block_name: 'items', block_default_count: 3, default_value: { color: 'red' } }];
const values = exported.buildInitialValues(fields);
assert.equal(values.items.length, 2);
assert.equal(values.items[0].nested.length, 3);
values.items[0].nested[0].text.color = 'blue';
assert.equal(values.items[1].nested[0].text.color, 'red');
assert.equal(values.items[0].nested[1].text.color, 'red');
assert.equal(exported.buildInitialValues(fields, { items: [] }).items.length, 0);
const saved = { items: [{ text: 'Saved', nested: [] }] };
const restored = exported.buildInitialValues(fields, saved);
assert.equal(restored.items.length, 1);
assert.equal(restored.items[0].nested.length, 0);
assert.equal(restored.items[0].text, 'Saved');
const resynced = parser.syncFieldsFromHTML('[BLOCK:items]{{text}}{{new_field}}[/BLOCK:items]', [{ ...field, block_default_count: 0 }]);
assert.ok(resynced.length >= 2);
assert.ok(resynced.every(item => item.block_default_count === 0));
const zeroFields = [{ ...field, block_default_count: 0 }];
let emptyDraft = exported.buildInitialValues(zeroFields);
const addSource = source.slice(source.indexOf('    const handleAddBlockEntry ='), source.indexOf('    const handleRemoveBlockEntry ='));
const addExports = {};
new Function('exports', 'setFieldValues', 'getBlockFields', 'getChildBlockFieldsMap', 'getRemovedBlockCacheKey', 'removedBlockEntryCacheRef', 'createBlockEntry',
    ts.transpileModule(addSource + '\nexport { handleAddBlockEntry };', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(addExports, update => { emptyDraft = update(emptyDraft); }, () => zeroFields,
    () => ({}), name => name, { current: {} }, exported.createBlockEntry);
addExports.handleAddBlockEntry('items');
assert.equal(emptyDraft.items.length, 1, 'Add creates exactly one entry even when the default is zero');
assert.equal(emptyDraft.items[0].text, 'Hello');
assert.equal(exported.createBlockEntry([field], undefined, { nested: [{ ...field, block_default_count: 0 }] }).nested.length, 0);
const customFields = [{ ...field, block_default_count: 3, block_default_values: { 0: 'First', 1: '' } }];
const customValues = exported.buildInitialValues(customFields);
assert.deepEqual(customValues.items.map(item => item.text), ['First', '', 'Hello']);
assert.equal(exported.createBlockEntry(customFields).text, 'Hello', 'Add uses shared defaults');
assert.equal(exported.createBlockEntry(customFields, { text: 'User edit' }).text, 'User edit', 'Duplicate retains user content');
assert.equal(exported.buildInitialValues(customFields, { items: [{ text: 'Saved' }] }).items[0].text, 'Saved');
const nestedCustom = exported.buildInitialValues([
    { ...field, block_default_count: 2 },
    { ...field, block_name: 'nested', parent_block_name: 'items', block_default_count: 2,
        block_default_values: { 0: { color: 'red' }, 1: 'Second child' } },
]);
assert.equal(nestedCustom.items[0].nested[1].text, 'Second child');
nestedCustom.items[0].nested[0].text.color = 'blue';
assert.equal(nestedCustom.items[1].nested[0].text.color, 'red');
const syncedCustom = parser.syncFieldsFromHTML('[BLOCK:items]{{text}}{{new_field}}[/BLOCK:items]', customFields);
assert.deepEqual(syncedCustom.find(item => item.variable_name === 'text').block_default_values, { 0: 'First', 1: '' });
assert.equal(syncedCustom.find(item => item.variable_name === 'new_field').block_default_values, undefined);
const typed = exported.buildInitialValues([
    { ...field, variable_name: 'size', type: 'slider', block_default_count: 2,
        config: { sliders: [{ default_value: 5 }] }, block_default_values: { 0: [0] } },
    { ...field, variable_name: 'enabled', type: 'checkbox', config: { true_value: 'yes', false_value: 'no' },
        block_default_values: { 0: 'yes' } },
]);
assert.deepEqual(typed.items.map(item => item.size), [[0], [5]]);
assert.deepEqual(typed.items.map(item => item.enabled), ['yes', 'no']);
console.log('Initial block counts 0–10, rendering, nested independence, saved drafts and blueprint sync passed.');
