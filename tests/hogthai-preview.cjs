const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies = {}) {
    const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    new Function('exports', 'require', 'module', output)(module.exports, name => dependencies[name] || require(name), module);
    return module.exports;
}
const parser = load('lib/template-parser.ts', { './colors': load('lib/colors.ts') });
const { parseHogthaiBBCode, generateFinalHTML } = parser;
assert.equal(parseHogthaiBBCode('[dohtml=width:700px;]\n[dohtml=padding:5px;][center][color="#FFFFFF"]Title[/color][/center][/dohtml]\n[indent]Text\n\nNext[/indent]\n[/dohtml]'), '<span id="dohtml_span" style="width:700px;"><br><span id="dohtml_span" style="padding:5px;"><div align="center"><span style="color:#FFFFFF">Title</span></div></span><br><blockquote>Text<br><br>Next</blockquote><br></span>');
assert.equal(parseHogthaiBBCode('[color="#B19CD8"]outer [color="#FFFFFF"]inner[/color][/color]'), '<span style="color:#B19CD8">outer <span style="color:#FFFFFF">inner</span></span>');
assert.ok(parseHogthaiBBCode('[googlefonts]Mitr:100 ,300[/googlefonts]').includes('family=Mitr%3A100%20%2C300'));
assert.equal(parseHogthaiBBCode('[code][dohtml=test]<b>\n[/code]'), '<pre>[dohtml=test]&lt;b&gt;<br></pre>');
assert.equal(parseHogthaiBBCode('<span style="color:red;\nfont-size:13px">a\nb</span>'), '<span style="color:red;\nfont-size:13px">a<br>b</span>');
const blueprint = '[dohtml=width:700px;]{{message}}[/dohtml]';
const fields = [{ id:'message',variable_name:'message',label:'Message',type:'bbcode',default_value:'',group_name:'General',group_order:0,field_order:0,block_order:0 }];
assert.equal(generateFinalHTML(blueprint,{ message:'[color="#FFFFFF"]Hi[/color]' },fields,false,'hogthai'), '[dohtml=width:700px;][color="#FFFFFF"]Hi[/color][/dohtml]');
assert.equal(generateFinalHTML(blueprint,{ message:'[color="#FFFFFF"]Hi[/color]' },fields,true,'hogthai'), '<span id="dohtml_span" style="width:700px;"><span style="color:#FFFFFF">Hi</span></span>');
const { previewViewport } = load('lib/preview-viewport.ts');
for (const [width, expected] of [[1440,1200.19],[1024,792.51],[768,760],[425,760],[375,760]]) {
    const result=previewViewport(width,900,350,400,'hogthai');
    assert.ok(Math.abs(result.postBodyWidth-expected)<0.02);
    assert.ok(result.scale*result.visibleWidth<=350.001);
}
const desktop = previewViewport(1920,1080,902,510,'hogthai');
assert.equal(desktop.scale,1,'Desktop must keep a 440px template at 440px');
assert.equal(desktop.visibleWidth,902);
assert.ok(desktop.postBodyWidth>1600,'Keep forum layout width independent of the visible crop');
const phone = previewViewport(375,812,350,400,'hogthai');
assert.ok(Math.abs(phone.scale-350/760)<0.0001);
for (const [width,panel] of [[1920,902],[1024,454],[768,702],[425,359]]) {
    const wide = previewViewport(width,858,panel,400,'hogthai',1120);
    assert.ok(Math.abs(wide.scale-panel/1120)<0.0001);
    assert.ok(wide.visibleWidth>=1120-0.001,'Wide template must fit without cropping');
}
assert.equal(previewViewport(1440,900,700,400).postBodyWidth,961);
console.log('Hogthai nested tags, line breaks, fonts, source export and viewport sizing passed.');

const { templatePreviewProfile } = load('lib/template-tags.ts', { './routes': load('lib/routes.ts') });
assert.equal(templatePreviewProfile(), 'roleplayth');
assert.equal(templatePreviewProfile([{ tags: null }]), 'roleplayth');
assert.equal(templatePreviewProfile([{ tags: { slug: 'other' } }]), 'roleplayth');
assert.equal(templatePreviewProfile([{ tags: { slug: ' HOGTHAI ' } }]), 'hogthai');
assert.equal(templatePreviewProfile([{ tags: { slug: 'other' } }, { tags: { slug: 'hogthai' } }]), 'hogthai');
console.log('Template site tags select the preview profile.');
