const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const cache = {};
function load(file) {
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText)(exports, name => load(path.resolve(path.dirname(file), name + '.ts')));
    return exports;
}
const { syncFieldsFromHTML, generateFinalHTML } = load(path.resolve('lib/template-parser.ts'));
const { BLOCK_ENTRY_ID: ID, BLOCK_GROUPS: GROUPS, renewBlockIds } = load(path.resolve('lib/block-state.ts'));
const { blockItems, reorderBlockItems, collapseBlockItems, copyBlockHTML, BLOCK_COLLAPSED: COLLAPSED } = load(path.resolve('lib/block-editor.ts'));
const blueprint = '{{global}}[BLOCK:header]<h1>{{title}}</h1>[/BLOCK:header]<main>[GBLOCK:feed][BLOCK:chat]<p>{{name}}[BLOCK:bubble]<b>{{text}} {{global}}</b>[/BLOCK:bubble]</p>[/BLOCK:chat][BLOCK:noti]<aside>{{message}}</aside>[/BLOCK:noti][/GBLOCK:feed]</main>';
const fields = syncFieldsFromHTML(blueprint).map(f => f.block_name === 'header' ? { ...f, block_sortable: false } : f);
const values = { global: 'G', header: [{ [ID]: 'h', title: 'Room' }], chat: [
    { [ID]: 'a', name: 'Alice', bubble: [{ [ID]: 'a1', text: 'one' }, { [ID]: 'a2', text: 'two' }] },
    { [ID]: 'b', name: 'Bob', bubble: [{ [ID]: 'b1', text: 'three' }] },
], noti: [{ [ID]: 'n', message: 'Joined' }], [GROUPS]: { feed: ['a', 'b', 'n'] } };
const scope = { groupName: 'feed' };
const reordered = reorderBlockItems(values, fields, scope, ['n', 'b', 'a']);
assert.deepEqual(blockItems(reordered, fields, scope).map(i => i.id), ['n', 'b', 'a']);
assert.deepEqual(reordered.chat.map(i => i[ID]), ['b', 'a']);
assert.deepEqual(values.chat.map(i => i[ID]), ['a', 'b'], 'Original state remains intact for undo');
assert.match(generateFinalHTML(blueprint, reordered, fields), /<aside>Joined<\/aside><p>Bob/);
assert.equal(reorderBlockItems(values, fields, scope, ['a', 'a', 'n']), values);
assert.equal(reorderBlockItems(values, fields, scope, ['a', 'missing', 'n']), values);
const locked = fields.map(f => f.block_name === 'noti' ? { ...f, block_sortable: false } : f);
assert.equal(reorderBlockItems(values, locked, scope, ['n', 'b', 'a']), values);
assert.deepEqual(reorderBlockItems(values, locked, scope, ['b', 'a', 'n'])[GROUPS].feed, ['b', 'a', 'n']);
const childScope = { blockName: 'bubble', parentBlockName: 'chat', parentId: 'a' };
const children = reorderBlockItems(reordered, fields, childScope, ['a2', 'a1']);
assert.deepEqual(children.chat[1].bubble.map(i => i[ID]), ['a2', 'a1']);
assert.equal(children.chat[0], reordered.chat[0], 'Other parent remains unchanged');
assert.equal(reorderBlockItems(values, fields, childScope, ['a1', 'b1']), values);
const collapsedChild = collapseBlockItems(children, ['a1'], true);
const collapsedParent = collapseBlockItems(collapsedChild, ['a'], true);
const expandedParent = collapseBlockItems(collapsedParent, ['a'], false);
assert.equal(expandedParent.chat[1].bubble[1][COLLAPSED], true);
assert.equal(generateFinalHTML(blueprint, collapsedParent, fields), generateFinalHTML(blueprint, children, fields));
assert.deepEqual(JSON.parse(JSON.stringify(collapsedParent)), collapsedParent);
const duplicated = renewBlockIds(collapsedParent.chat[1]);
assert.equal(duplicated[COLLAPSED], false);
assert.equal(duplicated.bubble[1][COLLAPSED], false);
assert.notEqual(duplicated[ID], 'a');
assert.equal(copyBlockHTML(blueprint, children, fields, scope, 'a'), '<p>Alice<b>two G</b><b>one G</b></p>');
assert.equal(copyBlockHTML(blueprint, children, fields, childScope, 'a1'), '<b>one G</b>');
assert.equal(copyBlockHTML(blueprint, children, fields, scope, 'n'), '<aside>Joined</aside>');
assert.equal(copyBlockHTML(blueprint, children, fields, { blockName: 'header' }, 'h'), '<h1>Room</h1>');
assert.throws(() => copyBlockHTML(blueprint, children, fields, scope, 'missing'));
const plainBlueprint = '[BLOCK:plain]<div>{{value}}</div>[/BLOCK:plain]';
const plainFields = syncFieldsFromHTML(plainBlueprint);
const plain = { plain: [{ [ID]: 'p1', value: '[b]One[/b]' }, { [ID]: 'p2', value: 'Two' }] };
const swapped = reorderBlockItems(plain, plainFields, { blockName: 'plain' }, ['p2', 'p1']);
assert.equal(generateFinalHTML(plainBlueprint, swapped, plainFields), '<div>Two</div><div>[b]One[/b]</div>');
assert.equal(copyBlockHTML(plainBlueprint, swapped, plainFields, { blockName: 'plain' }, 'p1'), '<div>[b]One[/b]</div>');
console.log('PASS: mixed/root/nested ordering, locked slots, immutable history snapshots, collapse, duplicate, JSON persistence and scoped copy');
