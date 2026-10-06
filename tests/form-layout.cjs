const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const cache = {};
function load(file) {
    if (cache[file]) return cache[file];
    const exports = cache[file] = {};
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText)(exports, name => load(path.resolve(path.dirname(file), name + '.ts')));
    return exports;
}
const { syncFormFields, getFormSections, setFormSectionOrder } = load(path.resolve('lib/form-layout.ts'));
const { syncFieldsFromHTML, generateFinalHTML } = load(path.resolve('lib/template-parser.ts'));
const names = fields => getFormSections(fields).map(s => `${s.kind}:${s.name}`);
const blueprint = '<div role="{{อาชีพหลัก[GROUP:info]}}">{{รูป[GROUP:image]}}{{ชื่อ[GROUP:info]}}[BLOCK:sub_class]<c>{{อาชีพรอง[GROUP:info]}}</c>[/BLOCK:sub_class]{{เนื้อหา[GROUP:roleplay]}}{{หมายเหตุ[GROUP:roleplay]}}[BLOCK:stats]{{HP[GROUP:stats]}}[/BLOCK:stats]</div>';
const legacy = syncFieldsFromHTML(blueprint);
assert.deepEqual(names(legacy), ['group:info', 'group:image', 'group:roleplay', 'block:sub_class', 'block:stats']);
assert.deepEqual(names(syncFormFields(blueprint, legacy)), names(legacy), 'Editing a legacy blueprint preserves the old layout');
const fresh = syncFormFields(blueprint, [], true);
assert.deepEqual(names(fresh), ['group:info', 'group:image', 'block:sub_class', 'group:roleplay', 'block:stats']);
const sections = getFormSections(fresh);
const moved = setFormSectionOrder(fresh, [sections[0].id, sections[2].id, sections[1].id, sections[3].id, sections[4].id]);
assert.deepEqual(names(moved), ['group:info', 'block:sub_class', 'group:image', 'group:roleplay', 'block:stats']);
assert.deepEqual(names(syncFormFields(blueprint, JSON.parse(JSON.stringify(moved)), true)), names(moved));
assert.equal(setFormSectionOrder(moved, [sections[0].id]), moved);
assert.equal(setFormSectionOrder(moved, Array(sections.length).fill(sections[0].id)), moved);
const replaced = syncFormFields(blueprint.replace('{{รูป[GROUP:image]}}', '{{รูปใหม่[GROUP:image]}}'), moved);
assert.deepEqual(names(replaced), names(moved), 'Replacing the sole field retains the section position');
const appended = syncFormFields('{{new[GROUP:extra]}}' + blueprint, moved);
assert.equal(names(appended).at(-1), 'group:extra', 'New sections append without shifting the saved layout');
const removed = syncFormFields(blueprint.replace('{{รูป[GROUP:image]}}', ''), moved);
assert.ok(!names(removed).includes('group:image'));
const values = { อาชีพหลัก: 'Mage', ชื่อ: 'Alice', รูป: 'pic', เนื้อหา: 'Body', หมายเหตุ: 'Note', sub_class: [{ อาชีพรอง: 'Healer' }], stats: [{ HP: '100' }] };
assert.equal(generateFinalHTML(blueprint, values, moved), generateFinalHTML(blueprint, values, legacy), 'Form order cannot change generated HTML');
assert.deepEqual(moved.map(f => f.id), fresh.map(f => f.id), 'Field identity stays unchanged');
const chat = '{{setting[GROUP:setting]}}[BLOCK:header]{{title}}[/BLOCK:header][GBLOCK:feed][BLOCK:chat]{{name}}[BLOCK:bubble]{{text}}[/BLOCK:bubble][/BLOCK:chat][BLOCK:noti]{{notice}}[/BLOCK:noti][/GBLOCK:feed]{{footer[GROUP:footer]}}';
const chatFields = syncFormFields(chat, [], true);
assert.deepEqual(names(chatFields), ['group:setting', 'block:header', 'gblock:feed', 'group:footer']);
const feed = getFormSections(chatFields).find(s => s.kind === 'gblock');
assert.deepEqual([...new Set(feed.fields.map(f => f.block_name))], ['chat', 'noti']);
assert.ok(feed.fields.every(f => !f.parent_block_name));
const sameNames = syncFormFields('{{value[GROUP:same]}}[BLOCK:same]{{value[GROUP:same]}}[/BLOCK:same]', [], true);
assert.equal(new Set(getFormSections(sameNames).map(s => s.id)).size, 2);
const scoped = syncFormFields('[BLOCK:first]{{same[GROUP:inside]}}[/BLOCK:first]{{other[GROUP:before]}}{{same[GROUP:after]}}', [], true);
assert.deepEqual(names(scoped), ['block:first', 'group:before', 'group:after']);
console.log('PASS: SevenSin/chat layouts, legacy compatibility, field/section replacement, persistence, scope isolation and unchanged generated HTML');
