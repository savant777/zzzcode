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
const { defaultBlockCount, canAddBlock, canRemoveBlock, blockLimits } = load('lib/block-defaults.ts');
const { BLOCK_ENTRY_ID, BLOCK_GROUPS, renewBlockIds, reconcileBlockGroups } = load('lib/block-state.ts');
const heights = load('lib/bbcode-height.ts');
const colors = load('lib/colors.ts');
const parser = compile(fs.readFileSync('lib/template-parser.ts', 'utf8'), { './colors': colors });
const { getDefaultValue } = compile(fs.readFileSync('lib/field-defaults.ts', 'utf8'), { './template-parser': parser });
const source = fs.readFileSync('app/editor/[id]/page.tsx', 'utf8');
const helpers = source.slice(source.indexOf('const createBlockEntry ='), source.indexOf('export default function EditorPage'));
const exported = {};
new Function('exports', 'BBCODE_HEIGHTS', 'getBBCodeHeights', 'getDefaultValue', 'defaultBlockCount', 'BLOCK_ENTRY_ID', 'BLOCK_GROUPS', 'reconcileBlockGroups', ts.transpileModule(
    helpers + '\nexport { createBlockEntry, buildInitialValues };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText)(exported, heights.BBCODE_HEIGHTS, heights.getBBCodeHeights, getDefaultValue, defaultBlockCount, BLOCK_ENTRY_ID, BLOCK_GROUPS, reconcileBlockGroups);
const field = { id: 'a', variable_name: 'text', block_name: 'items', type: 'text', default_value: 'Hello' };
for (let count = 0; count <= 10; count++) {
    const fields = [{ ...field, block_default_count: count }];
    const values = exported.buildInitialValues(fields);
    assert.equal(values.items.length, count);
    assert.equal(parser.generateFinalHTML('[BLOCK:items]{{text}}[/BLOCK:items]', values, fields), 'Hello'.repeat(count));
}
assert.equal(defaultBlockCount([field]), 1);
assert.equal(defaultBlockCount([{ ...field, block_default_count: -2 }]), 0);
assert.equal(defaultBlockCount([{ ...field, block_default_count: 40 }]), 40);
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
new Function('exports', 'setFieldValues', 'getBlockFields', 'getChildBlockFieldsMap', 'getRemovedBlockCacheKey', 'removedBlockEntryCacheRef', 'createBlockEntry', 'canAddBlock', 'reconcileBlockGroups', 'fields',
    ts.transpileModule(addSource + '\nexport { handleAddBlockEntry };', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(addExports, update => { emptyDraft = update(emptyDraft); }, () => zeroFields,
    () => ({}), name => name, { current: {} }, exported.createBlockEntry, canAddBlock, reconcileBlockGroups, zeroFields);
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

// Phase 1: limits, stable identity, grouped rendering and old draft migration.
assert.equal(defaultBlockCount([{ ...field, block_default_count: 25 }]), 25);
assert.equal(defaultBlockCount([{ ...field, block_min_count: 3, block_max_count: 5, block_default_count: 1 }]), 3);
assert.equal(defaultBlockCount([{ ...field, block_max_count: 2, block_default_count: 25 }]), 2);
assert.equal(canAddBlock([{ ...field, block_max_count: 0 }], 0), false);
assert.equal(canAddBlock([field], 500), true);
assert.equal(canRemoveBlock([{ ...field, block_min_count: 1 }], 1), false);
assert.deepEqual(blockLimits([{ ...field, block_min_count: 3, block_max_count: 1 }]), { min: 3, max: 3 });
const migrated = exported.buildInitialValues(fields, saved);
assert.ok(migrated.items[0][BLOCK_ENTRY_ID]);
assert.deepEqual(exported.buildInitialValues(fields, JSON.parse(JSON.stringify(migrated))), migrated);
const cloned = renewBlockIds(values.items[0]);
assert.notEqual(cloned[BLOCK_ENTRY_ID], values.items[0][BLOCK_ENTRY_ID]);
assert.notEqual(cloned.nested[0][BLOCK_ENTRY_ID], values.items[0].nested[0][BLOCK_ENTRY_ID]);
assert.equal(cloned.text, values.items[0].text);
const overLimit = exported.buildInitialValues([{ ...field, block_max_count: 1 }], { items: [{ text: 'A' }, { text: 'B' }] });
assert.equal(overLimit.items.length, 2, 'New limits never discard saved content');
const blueprint = '<main>[BLOCK:header]<h1>{{title}}</h1>[/BLOCK:header]<section>[GBLOCK:conversation][BLOCK:chat]<p>{{text}}[BLOCK:bubble]<b>{{body}}</b>[/BLOCK:bubble]</p>[/BLOCK:chat]\n[BLOCK:noti]<aside>{{message}}</aside>[/BLOCK:noti][/GBLOCK:conversation]</section></main>';
const groupedFields = parser.syncFieldsFromHTML(blueprint);
assert.equal(groupedFields.find(f => f.block_name === 'chat').block_group_name, 'conversation');
assert.equal(groupedFields.find(f => f.block_name === 'bubble').block_group_name, undefined);
let grouped = exported.buildInitialValues([...groupedFields].reverse(), {
    header: [{ title: 'Room' }], chat: [{ text: 'A', bubble: [{ body: 'one' }] }, { text: 'B', bubble: [] }], noti: [{ message: 'Joined' }],
});
const a = grouped.chat[0][BLOCK_ENTRY_ID], b = grouped.chat[1][BLOCK_ENTRY_ID], n = grouped.noti[0][BLOCK_ENTRY_ID];
assert.deepEqual(grouped[BLOCK_GROUPS].conversation, [a, b, n], 'Default order follows blueprint, not creator form order');
grouped[BLOCK_GROUPS].conversation = [a, n, b];
assert.equal(parser.generateFinalHTML(blueprint, grouped, groupedFields), '<main><h1>Room</h1><section><p>A<b>one</b></p><aside>Joined</aside><p>B</p></section></main>');
assert.deepEqual(exported.buildInitialValues(groupedFields, JSON.parse(JSON.stringify(grouped))), grouped);
const dup = renewBlockIds(grouped.chat[0]);
grouped = reconcileBlockGroups({ ...grouped, chat: [...grouped.chat, dup] }, groupedFields, a, dup[BLOCK_ENTRY_ID]);
assert.deepEqual(grouped[BLOCK_GROUPS].conversation, [a, dup[BLOCK_ENTRY_ID], n, b]);
const added = exported.createBlockEntry(groupedFields.filter(f => f.block_name === 'chat'));
grouped = reconcileBlockGroups({ ...grouped, chat: [...grouped.chat, added] }, groupedFields);
assert.equal(grouped[BLOCK_GROUPS].conversation.at(-1), added[BLOCK_ENTRY_ID]);
grouped = reconcileBlockGroups({ ...grouped, noti: [] }, groupedFields);
assert.ok(!grouped[BLOCK_GROUPS].conversation.includes(n));
assert.ok(!parser.generateFinalHTML(blueprint, grouped, groupedFields).includes('GBLOCK'));
for (const invalid of [
    '[GBLOCK:g]<div>[BLOCK:a]x[/BLOCK:a]</div>[/GBLOCK:g]',
    '[GBLOCK:g][BLOCK:a]x[/BLOCK:a][/GBLOCK:wrong]',
    '[GBLOCK:g][BLOCK:a]x[/BLOCK:a]',
    '[BLOCK:parent][GBLOCK:g][BLOCK:a]x[/BLOCK:a][/GBLOCK:g][/BLOCK:parent]',
    '[GBLOCK:g][BLOCK:a]x[/BLOCK:a][BLOCK:a]y[/BLOCK:a][/GBLOCK:g]',
]) assert.throws(() => parser.syncFieldsFromHTML(invalid));
// Exercise the actual editor mutation handlers rather than only the limit helpers.
let state = exported.buildInitialValues([{ ...field, block_min_count: 1, block_max_count: 1 }]);
const limitedFields = [{ ...field, block_min_count: 1, block_max_count: 1 }];
const operations = source.slice(source.indexOf('    const handleAddBlockEntry ='), source.indexOf('    const handleAddNestedBlockEntry ='));
const handlers = {};
const deps = { setFieldValues: fn => { state = fn(state); }, getBlockFields: () => limitedFields,
    getChildBlockFieldsMap: () => ({}), getRemovedBlockCacheKey: name => name,
    removedBlockEntryCacheRef: { current: {} }, createBlockEntry: exported.createBlockEntry,
    canAddBlock, canRemoveBlock, reconcileBlockGroups, fields: limitedFields, renewBlockIds,
    cloneFieldValues: structuredClone, BLOCK_ENTRY_ID };
new Function('exports', ...Object.keys(deps), ts.transpileModule(operations + '\nexport { handleAddBlockEntry, handleRemoveBlockEntry, handleDuplicateBlockEntry };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(handlers, ...Object.values(deps));
handlers.handleAddBlockEntry('items');
handlers.handleDuplicateBlockEntry('items', 0);
handlers.handleRemoveBlockEntry('items', 0);
assert.equal(state.items.length, 1);
console.log('Phase 1 limits, identity, GBLOCK ordering, migration and editor guards passed.');

const childLimit = { ...field, block_name: 'nested', parent_block_name: 'items', block_min_count: 1, block_max_count: 1 };
const nestedFields = [field, childLimit];
state = exported.buildInitialValues(nestedFields);
const nestedOperations = source.slice(source.indexOf('    const handleAddNestedBlockEntry ='), source.indexOf('    const requireConfirmationAfterClear ='));
const nestedHandlers = {};
const nestedDeps = { ...deps, fields: nestedFields, getBlockFields: (name, parent) => nestedFields.filter(f => f.block_name === name && f.parent_block_name === parent) };
new Function('exports', ...Object.keys(nestedDeps), ts.transpileModule(nestedOperations + '\nexport { handleAddNestedBlockEntry, handleRemoveNestedBlockEntry, handleDuplicateNestedBlockEntry };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(nestedHandlers, ...Object.values(nestedDeps));
nestedHandlers.handleAddNestedBlockEntry('items', 0, 'nested');
nestedHandlers.handleDuplicateNestedBlockEntry('items', 0, 'nested', 0);
nestedHandlers.handleRemoveNestedBlockEntry('items', 0, 'nested', 0);
assert.equal(state.items[0].nested.length, 1);
const changedConfig = parser.syncFieldsFromHTML('[BLOCK:items]{{text}}{{another}}[/BLOCK:items]', [{ ...field, block_min_count: 0, block_max_count: 1, block_sortable: false }]);
assert.ok(changedConfig.every(f => f.block_max_count === 1 && f.block_sortable === false));
console.log('Nested editor guards and config inheritance passed.');

const collapsedDraft = exported.buildInitialValues(fields, {
    items: [{ text: 'Parent', __zzzcode_collapsed: true, nested: [{ text: 'Child', __zzzcode_collapsed: true }] }],
});
const restoredCollapsed = exported.buildInitialValues(fields, JSON.parse(JSON.stringify(collapsedDraft)));
assert.equal(restoredCollapsed.items[0].__zzzcode_collapsed, true);
assert.equal(restoredCollapsed.items[0].nested[0].__zzzcode_collapsed, true);
assert.equal(restoredCollapsed.items[0][BLOCK_ENTRY_ID], collapsedDraft.items[0][BLOCK_ENTRY_ID]);
console.log('Collapsed parent/child states and IDs survive draft restoration.');
