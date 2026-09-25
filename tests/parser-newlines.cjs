const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/template-parser.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const colors = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/colors.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(colors);
new Function('exports', 'require', 'module', compiled)(loaded.exports, name => name === './colors' ? colors : require(name), loaded);
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
check('[paper]ย่อหน้าแรก\n\nย่อหน้าสอง[/paper]\n\n[bpaper]ย่อหน้าแรก\n\nย่อหน้าสอง[/bpaper]', '<div class="paper">ย่อหน้าแรก<br><br>ย่อหน้าสอง</div><br><div class="bpaper">ย่อหน้าแรก<br><br>ย่อหน้าสอง</div>');
for (const paper of ['paper', 'bpaper']) {
    check(`[${paper}][b]หัวข้อ[/b]\n[color=#aaaaaa]เนื้อหา[/color][/${paper}]`, `<div class="${paper}"><span style="font-weight: bold;" class="mycode_b">หัวข้อ</span><br><span style="color: #aaaaaa;" class="mycode_color">เนื้อหา</span></div>`);
    assert.equal(generateFinalHTML('{{body}}', { body: `[${paper}]เนื้อหา[/${paper}]` }, [field], false), `[${paper}]เนื้อหา[/${paper}]`);
}
for (const size of ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large']) {
    check(`[size=${size}]text[/size]\nnext`, `<span style="font-size: ${size};" class="mycode_size">text</span><br>next`);
    check(`[size=${size}]\n[b]bold[/b]\n\ntext\n[/size]`, `<span style="font-size: ${size};" class="mycode_size"><br><span style="font-weight: bold;" class="mycode_b">bold</span><br><br>text<br></span>`);
}
check('[size=invalid]text[/size]', '[size=invalid]text[/size]');
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
for (const literal of ['$&', '$$', '$`', "$'", '$1', '[b]$& $$[/b]']) {
    for (const isExport of [false, true]) {
        assert.equal(
            generateFinalHTML('before {{body}} after {{body}}', { body: literal }, [field], isExport),
            generateFinalHTML(`before ${literal} after ${literal}`, {}, [], isExport),
            `literal replacement: ${literal}, export: ${isExport}`,
        );
        count++;
    }
}
for (const emoticon of ['><', '> <', '<3', '1 < 2', '<test']) {
    check(`[bpaper]ย่อหน้าแรก\n\nย่อหน้าสอง ${emoticon} ข้อความ\n\nย่อหน้าสาม\n\nย่อหน้าสี่\n\nย่อหน้าห้า[/bpaper]`, `<div class="bpaper">ย่อหน้าแรก<br><br>ย่อหน้าสอง ${emoticon} ข้อความ<br><br>ย่อหน้าสาม<br><br>ย่อหน้าสี่<br><br>ย่อหน้าห้า</div>`);
}
const spacedText = '  ข้อความ   เว้นวรรค  \n\nย่อหน้า  ถัดไป  ';
check(spacedText, '  ข้อความ   เว้นวรรค  <br><br>ย่อหน้า  ถัดไป  ');
assert.equal(generateFinalHTML('{{body}}', { body: spacedText }, [field], false), spacedText);
count++;
const codeBlock = (body) => `<div class="codeblock"><div class="title">โค้ด:</div><div class="body" dir="ltr"><code>${body}</code></div></div>`;
check('[code]<div>text</div>\n\n[b]bold[/b] & &lt;[/code]', codeBlock('&lt;div&gt;text&lt;/div&gt;<br><br>[b]bold[/b] &amp; &amp;lt;'));
check('[code][list][*]item[/list]\n[img]image[/img][/code]', codeBlock('[list][*]item[/list]<br>[img]image[/img]'));
check('[code]one[/code]\n\n[code]two[/code]', codeBlock('one') + '<br>' + codeBlock('two'));
check('[code]\nline\n[/code]', codeBlock('<br>line<br>'));
check('[code]$& $$[/code]', codeBlock('$&amp; $$'));
check('<blockquote>\n[b]quote[/b]\n</blockquote>\nafter', '<blockquote><br><span style="font-weight: bold;" class="mycode_b">quote</span><br></blockquote><br>after');
assert.equal(generateFinalHTML('{{body}}', { body: '[code]<div>text</div>[/code]' }, [field], false), '[code]<div>text</div>[/code]');
count++;
console.log(`${count + 2} parser regression cases passed`);
