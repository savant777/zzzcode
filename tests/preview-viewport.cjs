const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies = {}) {
    const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    new Function('exports', 'require', 'module', output)(module.exports, name => dependencies[name] || require(name), module);
    return module.exports;
}
const sizing = load('lib/preview-viewport.ts');
for (const args of [[1440, 900, 700, 650], [1440, 900, 700, 300], [390, 844, 340, 220], [844, 390, 700, 120]]) {
    const size = sizing.previewViewport(...args);
    assert.ok(size.iframeHeight > 0 && size.iframeHeight <= args[1]);
    assert.ok(size.iframeHeight * size.scale <= args[3]);
    assert.ok(size.postBodyWidth * size.scale <= args[2]);
}

// Exercise the component's sizing effect and HTML updates without a browser.
// Any attempt to measure content fails; viewport sizing must use only the panel.
const state = [], refs = [], effects = [], observed = [], events = {};
let stateIndex = 0, refIndex = 0;
const React = {
    useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect(effect) { effects.push(effect); },
};
global.window = { innerWidth: 1440, innerHeight: 900,
    addEventListener(name, handler) { events[name] = handler; }, removeEventListener(name) { delete events[name]; } };
global.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe(target) { observed.push(target); } disconnect() {} };
const LivePreview = load('components/LivePreview.tsx', { react: React, '@/lib/preview-viewport': sizing }).default;
const panel = { offsetWidth: 700, clientHeight: 600 };
const post = { innerHTML: '' };
Object.defineProperty(post, 'scrollHeight', { get() { throw new Error('Content must not resize the viewport'); } });
const doc = { querySelector: () => post, head: { querySelectorAll: () => [] } };
const frame = { contentDocument: doc, addEventListener() {}, removeEventListener() {} };
function render(html) {
    stateIndex = refIndex = 0;
    effects.length = 0;
    return LivePreview({ html });
}
render('<div style="height:100vh">Initial</div>');
refs[0].current = panel;
refs[1].current = frame;
const cleanup = effects.map(effect => effect());
assert.deepEqual(observed, [panel]);
const expected = state[1];
for (const html of [
    '<div style="height:100vh;padding:64px">Full height</div>',
    '<div style="height:200vh">Two viewports</div>',
    '<div style="height:50vh">Half height</div>',
    '<div style="height:10000px">Long content</div>',
    '<img src="late-loading.png"><div>Updated text</div>',
]) {
    const tree = render(html);
    effects[2](); // HTML update, as React would run for a changed html prop.
    assert.equal(post.innerHTML, html);
    assert.equal(state[1], expected);
    assert.ok(tree.props.className.includes('overflow-hidden'));
    const iframe = tree.props.children.props.children.props.children;
    assert.equal(iframe.props.style.height, `${expected}px`);
    assert.ok(iframe.props.srcDoc.includes('overflow-y: auto'));
}
window.innerHeight = 400;
events.resize();
assert.equal(state[1], 400);
cleanup.forEach(fn => fn?.());
assert.equal(events.resize, undefined);
console.log('Preview viewport bounds, content-independent height, HTML updates and resize checks passed.');
