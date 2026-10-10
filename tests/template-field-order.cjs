const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = {};
function load(file) {
    if (cache[file]) return cache[file];
    const exports = cache[file] = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('exports', 'require', source)(exports, name => {
        if (name === 'react/jsx-runtime') return require(name);
        if (name === './TemplateBlockContainer' || name === './FormOrderEditor') return { default: name };
        return load(name.startsWith('@/') ? path.resolve(name.slice(2) + '.ts') : path.resolve(path.dirname(file), name + '.ts'));
    });
    return exports;
}
const { syncFieldsFromHTML, reorderFields } = load(path.resolve('lib/template-parser.ts'));
const render = load(path.resolve('components/TemplateFormSections.tsx')).default;
const blueprint = '{{Title}}{{Location}}{{image[GROUP:image]}}';
// Legacy fields can retain different group ranks after their group changes.
const fields = syncFieldsFromHTML(blueprint).map((field, index) => ({ ...field, group_order: index, field_order: 0 }));
const title = fields.find(f => f.variable_name === 'Title');
const location = fields.find(f => f.variable_name === 'Location');
function displayedGeneral(input) {
    const tree = render({ fields: input, onFieldsChange() {} });
    return tree.props.children[1].flatMap(section => section.props.children.props.groups?.General || []).map(f => f.variable_name);
}
assert.deepEqual(displayedGeneral(fields), ['Title', 'Location']);
const moved = reorderFields(fields, 'General', title.id, location.id, 'GLOBAL');
assert.deepEqual(displayedGeneral(moved), ['Location', 'Title'], 'Field order must override stale group ranks inside General');
assert.deepEqual(displayedGeneral(syncFieldsFromHTML(blueprint, JSON.parse(JSON.stringify(moved)))), ['Location', 'Title'], 'Order survives blueprint sync and persistence');
assert.equal(moved.find(f => f.variable_name === 'image'), fields.find(f => f.variable_name === 'image'));
assert.deepEqual(displayedGeneral(reorderFields(moved, 'General', location.id, title.id, 'GLOBAL')), ['Title', 'Location']);
console.log('PASS: General field reorder, reverse, persistence and other-group isolation');
