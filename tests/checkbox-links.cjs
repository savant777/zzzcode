const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, deps = {}) {
    const exports = {};
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText)(exports, name => deps[name] || require(name));
    return exports;
}
const parser = load('lib/template-parser.ts', { './colors': load('lib/colors.ts') });
const { generateFinalHTML: render, getCheckboxLinkSource: source } = parser;
const main = { id: 'main', variable_name: 'toggle', label: 'Toggle', group_name: 'Settings', type: 'checkbox', default_value: 'div', config: { true_value: 'details', false_value: 'div' } };
const linked = { ...main, id: 'linked', variable_name: 'heading', config: { true_value: 'summary', false_value: 'div', checkbox_source_id: 'main' } };
const fields = [main, linked];
const html = '<{{toggle}}><{{heading}}>[BLOCK:header]Title[/BLOCK:header]</{{heading}}></{{toggle}}>';
assert.equal(render(html, { toggle: 'details', heading: 'div' }, fields), '<details><summary></summary></details>');
assert.equal(render(html, { toggle: 'div', heading: 'summary' }, fields), '<div><div></div></div>');
assert.equal(render(html, { toggle: 'details', header: [{}] }, fields), '<details><summary>Title</summary></details>');
assert.equal(render(html, {}, fields), '<div><div></div></div>');
assert.equal(render(html, { toggle: 'details' }, fields, true), '<details><summary></summary></details>');
const child = { ...linked, block_name: 'items' };
assert.equal(render('[BLOCK:items]{{heading}};[/BLOCK:items]', { toggle: 'details', items: [{ heading: 'div' }, {}] }, [main, child]), 'summary;summary;');
const localMain = { ...main, block_name: 'items' };
assert.equal(render('[BLOCK:items]{{heading}};[/BLOCK:items]', { items: [{ toggle: 'details' }, { toggle: 'div' }] }, [localMain, child]), 'summary;div;');
const nested = { ...child, block_name: 'nested', parent_block_name: 'items' };
assert.equal(render('[BLOCK:items][BLOCK:nested]{{heading}};[/BLOCK:nested][/BLOCK:items]', { items: [{ toggle: 'details', nested: [{}] }, { toggle: 'div', nested: [{}] }] }, [localMain, nested]), 'summary;div;');
const chained = { ...linked, id: 'third', variable_name: 'css', config: { true_value: 'hidden', false_value: 'visible', checkbox_source_id: 'linked' } };
assert.equal(render('{{css}}', { toggle: 'details' }, [...fields, chained]), 'hidden');
assert.equal(source(linked, [linked]), undefined);
assert.equal(source(linked, [{ ...main, type: 'text' }, linked]), undefined);
assert.equal(source(linked, [{ ...main, config: { ...main.config, checkbox_source_id: 'linked' } }, linked]), undefined);
assert.equal(source(child, [{ ...main, block_name: 'other' }, child]), undefined);
assert.equal(source(main, [{ ...main, config: { checkbox_source_id: 'main' } }]), undefined);
assert.equal(render('{{heading}}', { heading: 'summary' }, [linked]), 'summary');
assert.equal(parser.normalizeFieldConfig(linked).config.checkbox_source_id, 'main');
// The editor renders only the controlling field and keeps invalid links editable.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const EditorForm = load('components/EditorForm.tsx', {
    '@/lib/template-parser': parser,
    '@/lib/form-layout': { getFormSections: fields => [{ id: 'settings', kind: 'group', name: 'Settings', fields }] },
    '@/lib/bbcode-height': { getBBCodeHeights: () => ({}) },
    './EditorBlocks': { default: () => null },
    './FieldRenderer': { default: ({ field }) => React.createElement('span', null, field.variable_name) },
}).default;
const form = f => renderToStaticMarkup(React.createElement(EditorForm, { fields: f, values: {} }));
assert.ok(form(fields).includes('toggle'));
assert.ok(!form(fields).includes('heading'));
assert.ok(form([linked]).includes('heading'));
console.log('Checkbox links: mapping, export, defaults, repeated/nested scopes, chains, invalid links and editor visibility passed.');
