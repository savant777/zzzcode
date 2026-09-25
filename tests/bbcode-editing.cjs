const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path) {
    const exports = {};
    new Function('exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(exports);
    return exports;
}
const { BBCodeHistory } = load('lib/bbcode-history.ts');
const { bbcodeShortcutKey } = load('lib/bbcode-shortcut.ts');
for (const [key, code, expected] of [
    ['ิ', 'KeyB', 'b'], ['ร', 'KeyI', 'i'], ['ี', 'KeyU', 'u'],
    ['ผ', 'KeyZ', 'z'], ['ั', 'KeyY', 'y'], ['B', 'KeyB', 'b'],
    ['b', '', 'b'], ['a', 'KeyA', null], ['ร', '', null],
]) assert.equal(bbcodeShortcutKey(key, code), expected);
const first = new BBCodeHistory('Hello');
const second = new BBCodeHistory('Other field');
first.select(0, 5);
first.record({ value: '[b]Hello[/b]', start: 12, end: 12 });
assert.deepEqual(first.undo(), { value: 'Hello', start: 0, end: 5 });
assert.equal(second.current.value, 'Other field');
assert.equal(first.redo().value, '[b]Hello[/b]');
first.undo();
first.record({ value: '[i]Hello[/i]', start: 12, end: 12 });
assert.equal(first.redo(), null);
first.sync('Loaded backup');
assert.equal(first.undo(), null, 'External loads cannot undo into another draft');
for (let i = 0; i < 120; i++) first.record({ value: String(i), start: 1, end: 1 });
let count = 0;
while (first.undo()) count++;
assert.equal(count, 100);

const { BBCODE_HEIGHTS, getBBCodeHeights, updateBBCodeHeight } = load('lib/bbcode-height.ts');
const original = { block: [{ text: 'one', child: [{ text: 'two' }] }] };
const resized = updateBBCodeHeight(original, ['block', 0, 'child', 0], 'text', 420);
assert.equal(getBBCodeHeights(resized.block[0].child[0]).text, 420);
assert.deepEqual(original, { block: [{ text: 'one', child: [{ text: 'two' }] }] });
const duplicate = JSON.parse(JSON.stringify(resized.block[0]));
assert.equal(getBBCodeHeights(duplicate.child[0]).text, 420);
const independentlyResized = updateBBCodeHeight({ block: [resized.block[0], duplicate] }, ['block', 1, 'child', 0], 'text', 300);
assert.equal(getBBCodeHeights(independentlyResized.block[0].child[0]).text, 420);
assert.equal(getBBCodeHeights(independentlyResized.block[1].child[0]).text, 300);
assert.deepEqual(getBBCodeHeights({ [BBCODE_HEIGHTS]: { invalid: '400', small: 2, valid: 76 } }), { valid: 76 });
assert.equal(updateBBCodeHeight(original, ['missing', 0], 'text', 256), original);
// Exercise the actual reconstruction used by draft loading and block duplication.
const editorSource = fs.readFileSync('app/editor/[id]/page.tsx', 'utf8');
const helpers = editorSource.slice(editorSource.indexOf('const createBlockEntry ='), editorSource.indexOf('export default function EditorPage'));
const helperExports = {};
new Function('exports', 'BBCODE_HEIGHTS', 'getBBCodeHeights', 'getDefaultValue', ts.transpileModule(
    helpers + '\nexport { createBlockEntry, buildInitialValues };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText)(helperExports, BBCODE_HEIGHTS, getBBCodeHeights, field => field.default_value);
const fields = [{ variable_name: 'text', default_value: 'default' }];
const copiedBlock = helperExports.createBlockEntry(fields, resized.block[0], { child: fields });
assert.equal(getBBCodeHeights(copiedBlock.child[0]).text, 420);
const restored = helperExports.buildInitialValues([
    ...fields,
    { ...fields[0], block_name: 'block' },
    { ...fields[0], block_name: 'child', parent_block_name: 'block' },
], { ...resized, text: 'Root', [BBCODE_HEIGHTS]: { text: 146 } });
assert.equal(getBBCodeHeights(restored).text, 146);
assert.equal(getBBCodeHeights(restored.block[0].child[0]).text, 420);
console.log('BBCode undo/redo isolation, selection, history bounds, nested heights and duplication passed.');
