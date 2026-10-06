const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies = {}) {
    const exports = {};
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(exports, name => dependencies[name] || require(name));
    return exports;
}
const colors = load('lib/colors.ts');
assert.equal(colors.normalizeColorWhileTyping('ff8c00'), '#FF8C00');
assert.equal(colors.normalizeColorWhileTyping('dee'), 'dee');
assert.equal(colors.normalizeColorWhileTyping('deeppink'), 'deeppink');
assert.equal(colors.normalizeColorWhileTyping('#ff8c00'), '#FF8C00');
assert.equal(colors.normalizeColorWhileTyping(''), '');
let typedColor = '';
for (const char of 'ff8c00') typedColor = colors.normalizeColorWhileTyping(typedColor + char);
assert.equal(typedColor, '#FF8C00');
const parser = load('lib/template-parser.ts', { './colors': colors });
const defaults = load('lib/field-defaults.ts', { './template-parser': parser });
for (const [input, expected] of [
    ['abc', '#ABC'], ['a1b2c3', '#A1B2C3'], ['a1b2c3d4', '#A1B2C3D4'],
    ['#abcd', '#ABCD'], ['red', 'red'], ['beige', 'beige'], ['transparent', 'transparent'],
    ['rgba(1, 2, 3, 0.5)', 'rgba(1, 2, 3, 0.5)'], ['not-a-color', 'not-a-color'], ['', ''],
]) assert.equal(colors.normalizeColorInput(input), expected);
const makeField = options => ({ type: 'select', default_value: '', config: { select_options: options } });
const options = [{ id: 'first', option: 'A', value: 'A' }, { id: 'chosen', option: 'B', value: 'B', is_default: true }];
assert.equal(defaults.getDefaultValue(makeField(options)), 'B');
assert.equal(defaults.getDefaultValue(makeField([...options].reverse())), 'B');
assert.equal(defaults.getDefaultValue(makeField([options[0]])), 'A');
assert.equal(defaults.getDefaultValue(makeField(options.map(({ is_default, ...option }) => option))), 'A');
for (const type of ['text', 'bbcode', 'color', 'color-text', 'slider', 'gradient']) {
    const field = makeField([{ option: 'A', value: 'same' }, { option: 'B', value: 'same', type, default_value: 'custom', is_default: true }]);
    const value = defaults.getDefaultValue(field);
    assert.equal(value.option_index, 1, type);
    assert.equal(value.value, 'same', type);
    field.config.select_multiple = true;
    assert.equal(defaults.getDefaultValue(field).selected[0].option_index, 1, type);
}
const multiple = makeField(options);
multiple.config.select_multiple = true;
assert.deepEqual(defaults.getDefaultValue(multiple), { multiple: true, selected: [{ option_index: 1, value: 'B' }] });
console.log('Color normalization and select default tests passed');
