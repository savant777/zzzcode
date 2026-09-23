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
    useLayoutEffect(effect) { effects.push(effect); },
};
const visualEvents = {};
global.window = { visualViewport: { addEventListener(name, fn) { visualEvents[name] = fn; }, removeEventListener(name) { delete visualEvents[name]; } }, innerWidth: 1440, innerHeight: 900,
    addEventListener(name, handler) { events[name] = handler; }, removeEventListener(name) { delete events[name]; } };
global.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe(target) { observed.push(target); } disconnect() {} };
const LivePreview = load('components/LivePreview.tsx', { react: React, '@/lib/preview-viewport': sizing }).default;
const panel = { offsetWidth: 700, clientHeight: 600 };
const post = { innerHTML: '' };
Object.defineProperty(post, 'scrollHeight', { get() { throw new Error('Content must not resize the viewport'); } });
const properties = {};
const doc = { documentElement: { style: { setProperty(name, value) { properties[name] = value; } } }, querySelector: () => post, head: { querySelectorAll: () => [] } };
const frameEvents = {};
const frame = { contentDocument: doc, addEventListener(name, fn) { frameEvents[name] = fn; }, removeEventListener(name) { delete frameEvents[name]; } };
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
    effects[3](); // HTML update, as React would run for a changed html prop.
    assert.equal(post.innerHTML, html);
    assert.equal(state[1], expected);
    assert.ok(tree.props.className.includes('overflow-hidden'));
    const iframe = tree.props.children.props.children;
    assert.equal(iframe.props.style.height, `${expected}px`);
    assert.ok(iframe.props.srcDoc.includes('overflow-y: auto'));
}
const initialSrcDoc = render('Before resize').props.children.props.children.props.srcDoc;
window.innerWidth = 412;
panel.offsetWidth = 346;
events.resize();
const mobileTree = render('After resize');
effects[1]();
const mobileIframe = mobileTree.props.children.props.children;
assert.equal(mobileIframe.props.srcDoc, initialSrcDoc, 'Resize must not reload iframe document');
assert.equal(properties['--preview-post-width'], '605px');
assert.equal(mobileIframe.props.style.position, 'absolute');
assert.equal(mobileIframe.props.style.left, '-0px');
assert.equal(mobileIframe.props.style.transformOrigin, 'top left');
assert.ok(mobileIframe.props.srcDoc.includes('name="viewport"'));
window.innerHeight = 400;
events.resize();
assert.equal(state[1], 400);
window.innerHeight = 350;
visualEvents.resize();
assert.equal(state[1], 350, 'Mobile visual viewport changes remeasure the panel');
window.innerHeight = 375;
events.pageshow();
assert.equal(state[1], 375, 'Returning to the page refreshes viewport bounds');
frameEvents.load();
assert.equal(properties['--preview-post-width'], '605px', 'Late iframe load receives the current mobile width');
cleanup.forEach(fn => fn?.());
assert.equal(visualEvents.resize, undefined);
assert.equal(events.pageshow, undefined);
assert.equal(events.resize, undefined);
console.log('Preview viewport bounds, content-independent height, HTML updates and resize checks passed.');
