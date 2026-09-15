const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/template-parser.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { parseBBCode, generateFinalHTML } = loaded.exports;
let count = 0;
function check(input, expected) {
    assert.equal(generateFinalHTML(input, {}, [], true), expected, input);
    assert.equal(parseBBCode(input), expected, `direct: ${input}`);
    count++;
}
for (const tag of ['div', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']) {
    for (const n of [1, 2]) {
        const nl = '\n'.repeat(n);
        check(`<${tag}>${nl}text${nl}</${tag}>${nl}after`, `<${tag}>${'<br>'.repeat(n-1)}text${'<br>'.repeat(n)}</${tag}>${'<br>'.repeat(n-1)}after`);
    }
}
for (const tag of ['span', 'a', 'abbr', 'section', 'label', 'details', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    for (const n of [1, 2]) {
        const nl = '\n'.repeat(n), br = '<br>'.repeat(n);
        check(`<${tag}>${nl}text${nl}</${tag}>${nl}after`, `<${tag}>${br}text${br}</${tag}>${br}after`);
    }
}
for (const tag of ['<img src="image">', '<img src="image" style="display:block">', '<input type="text">', '<iframe></iframe>']) {
    for (const n of [0, 1, 2]) check(`before${tag}${'\n'.repeat(n)}after`, `before${tag}${'<br>'.repeat(n)}after`);
}
check('one\n\ntwo', 'one<br><br>two');
check('[b]bold[/b]\n[color=#aaaaaa]color[/color]', '<span style="font-weight: bold;" class="mycode_b">bold</span><br><span style="color: #aaaaaa;" class="mycode_color">color</span>');
for (const kind of ['', '=1']) {
    for (const n of [0, 1, 2]) {
        const tag = kind ? 'ol' : 'ul';
        const opening = kind ? '<ol type="1"' : '<ul';
        check(`before${'\n'.repeat(n)}[list${kind}]\n\n[*]one\n[*]two\n\n[/list]${'\n'.repeat(n)}after`, `before${'<br>'.repeat(kind ? Math.max(1,n) : Math.max(0,n-1))}${opening} class="mycode_list"><li>one<br></li><li>two<br><br></li></${tag}>${'<br>'.repeat(Math.max(0,n-1))}after`);
    }
}
for (const n of [0, 1, 2]) {
    const nl = '\n'.repeat(n);
    check(`before${nl}[hide]${nl}text${nl}[/hide]${nl}after`, `before${'<br>'.repeat(n)}<div class="hidden-content"><div class="hidden-content-title"><strong>เนื้อหาที่ถูกซ่อน</strong><br></div><div class="hidden-content-body">${'<br>'.repeat(n)}text${'<br>'.repeat(n+1)}</div></div>${'<br>'.repeat(Math.max(0,n-1))}after`);
}
check('[hide]<div>text</div>[/hide]', '<div class="hidden-content"><div class="hidden-content-title"><strong>เนื้อหาที่ถูกซ่อน</strong><br></div><div class="hidden-content-body"><div>text</div></div></div>');
for (const align of ['left','center','right','justify']) check(`[align=${align}]\ntext\n[/align]\nafter`, `<div style="text-align: ${align};" class="mycode_align">text<br></div>after`);
check('before\n[hr]\n\nafter', 'before<br><hr class="mycode_hr"><br>after');
check('<style>p {\n color: red;\n}</style>\ntext', '<style>p {\n color: red;\n}</style><br>text');
check('<a title="a > b\nc">text</a>\nafter', '<a title="a > b\nc">text</a><br>after');
// LK1–LK6: stylesheet links consume only the first following newline.
const stylesheet = '<link href="https://savant777.github.io/zoecode/elysian-curse2026.css" rel="stylesheet">';
for (const n of [0, 1, 2]) {
    const nl = '\n'.repeat(n);
    const after = '<br>'.repeat(Math.max(0, n - 1));
    check(`${stylesheet}${nl}<div>text</div>`, `${stylesheet}${after}<div>text</div>`);
    check(`before${nl}${stylesheet}${nl}after`, `before${'<br>'.repeat(n)}${stylesheet}${after}after`);
}
const field = { variable_name: 'body', type: 'bbcode', default_value: '' };
for (const tag of ['yt', 'ytauto', 'hideyt', 'img', 'spoiler']) {
    for (const n of [0, 1, 2]) {
        const nl = '\n'.repeat(n);
        const source = tag === 'img' ? '[img]https://example.com/a.png[/img]' : tag === 'spoiler' ? '[spoiler]text[/spoiler]' : `[${tag}=jDFZaens55Y][/${tag}]`;
        const rendered = parseBBCode(source, false);
        check(`before${nl}${source}${nl}after`, `before${'<br>'.repeat(n)}${rendered}${'<br>'.repeat(tag === 'spoiler' ? Math.max(0,n-1) : n)}after`);
    }
}
for (const n of [1, 2]) {
    const nl = '\n'.repeat(n);
    const expected = parseBBCode('[spoiler]CONTENT[/spoiler]', false).replace('CONTENT', '<br>'.repeat(n-1) + 'text' + '<br>'.repeat(n));
    check(`[spoiler]${nl}text${nl}[/spoiler]`, expected);
}
assert.equal(generateFinalHTML('{{body}}', { body: 'before\n[list][*]one\n[/list]' }, [field], true), generateFinalHTML('before\n[list][*]one\n[/list]', {}, [], true));
assert.equal(generateFinalHTML('{{body}}', { body: '[b]text[/b]\nnext' }, [field], false), '[b]text[/b]\nnext');
console.log(`${count + 2} parser regression cases passed`);
