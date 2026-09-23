const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('lib/creator-credit.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', output)(loaded.exports);
const { tagsWithCreatorCredit, creatorCreditChanges } = loaded.exports;
const tags = [
    { id: 1, user_id: 'zoe', tag_groups: { name: 'creators' } },
    { id: 2, user_id: 'tissue', tag_groups: { name: 'creators' } },
    { id: 3, user_id: null, tag_groups: { name: 'creators' } },
    { id: 4, user_id: null, tag_groups: { name: 'houses' } },
];
assert.deepEqual(tagsWithCreatorCredit(tags, ['4'], '1', 'zoe'), ['4', '1']);
assert.deepEqual(tagsWithCreatorCredit(tags, ['4', '1', '1'], '3', 'zoe'), ['4', '3']);
assert.deepEqual(tagsWithCreatorCredit(tags, ['4', '2'], '3', 'tissue'), ['4', '3']);
assert.throws(() => tagsWithCreatorCredit(tags, [], '2', 'zoe'));
assert.throws(() => tagsWithCreatorCredit(tags, [], '4', 'zoe'));
assert.throws(() => tagsWithCreatorCredit(tags, [], 'missing', 'zoe'));
assert.throws(() => tagsWithCreatorCredit(tags, ['missing'], '1', 'zoe'));
console.log('Creator credit defaults, shared tags, replacement and validation passed.');
assert.deepEqual(creatorCreditChanges(tags, ['1'], '3', 'zoe'), { remove: ['1'], add: ['3'] });
assert.deepEqual(creatorCreditChanges(tags, ['3'], '1', 'zoe'), { remove: ['3'], add: ['1'] });
assert.deepEqual(creatorCreditChanges(tags, ['3'], '3', 'zoe'), { remove: [], add: [] });
assert.deepEqual(creatorCreditChanges(tags, ['1', '3'], '3', 'zoe'), { remove: ['1'], add: [] });
assert.deepEqual(creatorCreditChanges(tags, [], '3', 'tissue'), { remove: [], add: ['3'] });
assert.throws(() => creatorCreditChanges(tags, ['1'], '2', 'zoe'));
assert.throws(() => creatorCreditChanges(tags.filter(tag => tag.id !== 3), ['1'], '3', 'zoe'));
console.log('Edit credit replacement, existing credit and unavailable choices passed.');
