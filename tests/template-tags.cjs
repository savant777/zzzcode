const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/template-tags.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports,
    name => name === './routes' ? loadTs('lib/routes.ts') : require(name), loaded);
const { visibleTemplateTags, templateTagChanges, templateRoute } = loaded.exports;
const active = { tags: { is_active: true, slug: 'golden-gather', tag_groups: { name: 'sapiens' } } };
const inactive = { tags: { is_active: false, slug: 'sapiens', tag_groups: { name: 'activity' } } };
assert.deepEqual(visibleTemplateTags([{ tags: null }, inactive, active]), [active]);
assert.deepEqual(visibleTemplateTags(null), []);
assert.deepEqual(visibleTemplateTags([{ tags: null }, inactive]), []);
assert.deepEqual(visibleTemplateTags([{ tags: { ...active.tags, tag_groups: null } }]), []);
inactive.tags.is_active = true;
assert.deepEqual(visibleTemplateTags([inactive, active]), [inactive, active]);
// Keep disabled tags and creator tags; remove only deselected editable tags.
assert.deepEqual(templateTagChanges(['hidden', 'creator', 'old'], ['new', 'new'], ['old', 'new']), {
    remove: ['old'], add: ['new'],
});
// A stale draft must not recreate a deleted or deactivated tag.
assert.deepEqual(templateTagChanges(['hidden', 'active'], ['deleted', 'hidden', 'active'], ['active']), {
    remove: [], add: [],
});
// Render the real card in both layouts with RLS-hidden, inactive and empty tags.
function loadTs(path, dependencies = {}) {
    const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    new Function('exports', 'require', 'module', output)(module.exports,
        name => dependencies[name] || require(name), module);
    return module.exports;
}
const routes = loadTs('lib/routes.ts');
assert.equal(routes.getGroupSlug('Sapiens'), 'sapiens');
for (const group of ['activity', 'sapiens', 'houses', 'shops', 'commission']) {
    assert.ok(routes.PRIMARY_ROUTE_GROUPS.includes(group));
}
const navigations = [];
const TemplateCard = loadTs('components/TemplateCard.tsx', {
    'next/navigation': { useRouter: () => ({ push(url) { navigations.push(url); } }) },
    '@/lib/routes': routes,
    '@/lib/template-tags': loaded.exports,
    '@/lib/dashboard': loadTs('lib/dashboard.ts', { './routes': routes }),
}).default;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
inactive.tags.is_active = false;
active.tags.name = 'Golden Gather';
inactive.tags.name = 'Hidden Party';
assert.deepEqual(templateRoute([active], 'activity:golden-gather'), { group: 'sapiens', tag: 'golden-gather' });
assert.deepEqual(templateRoute([inactive, active], 'activity:sapiens'), { group: 'sapiens', tag: 'golden-gather' });
assert.deepEqual(templateRoute([active], 'sapiens:all'), { group: 'sapiens', tag: 'golden-gather' });
assert.deepEqual(templateRoute([active], 'category:all'), { group: 'sapiens', tag: 'golden-gather' });
assert.deepEqual(templateRoute([{ tags: null }, inactive], 'activity:sapiens'), { group: 'category', tag: 'all' });
const cssTag = { tags: { is_active: true, slug: 'minimal', tag_groups: { name: 'css' } } };
assert.deepEqual(templateRoute([active, cssTag], 'css:minimal'), { group: 'sapiens', tag: 'golden-gather' });
const categoryTag = { tags: { is_active: true, slug: 'etc', tag_groups: { name: 'category' } } };
const creatorTag = { tags: { is_active: true, slug: 'author', tag_groups: { name: 'creators' } } };
assert.ok(!routes.PRIMARY_ROUTE_GROUPS.includes('creators'));
const priorityTags = ['activity', 'sapiens', 'houses', 'shops', 'commission'].map(group => ({
    tags: { is_active: true, slug: `${group}-tag`, tag_groups: { name: group } },
}));
for (let index = 0; index < priorityTags.length; index++) {
    const eligible = priorityTags.slice(index);
    const first = eligible[0].tags;
    assert.deepEqual(templateRoute([...eligible].reverse(), 'commission:commission-tag'), {
        group: first.tag_groups.name, tag: first.slug,
    });
}
const secondActivity = { tags: { is_active: true, slug: 'other-activity', tag_groups: { name: 'activity' } } };
assert.deepEqual(templateRoute([...priorityTags, secondActivity], 'activity:other-activity'), {
    group: 'activity', tag: 'other-activity',
});
assert.deepEqual(templateRoute([
    { tags: { ...priorityTags[0].tags, is_active: false } }, ...priorityTags.slice(1),
], 'activity:activity-tag'), { group: 'sapiens', tag: 'sapiens-tag' });
for (const group of ['activity', 'commission', 'houses', 'shops', 'sapiens']) {
    const primary = { tags: { is_active: true, slug: 'chosen', tag_groups: { name: group } } };
    for (const source of ['category:etc', 'creators:author', 'css:minimal', 'category:all']) {
        assert.deepEqual(templateRoute([creatorTag, categoryTag, cssTag, primary], source), {
            group: routes.getGroupSlug(group), tag: 'chosen',
        });
    }
}
assert.deepEqual(templateRoute([creatorTag, cssTag, categoryTag], 'creators:author'), { group: 'category', tag: 'etc' });
assert.deepEqual(templateRoute([creatorTag, cssTag], 'creators:author'), { group: 'category', tag: 'all' });
assert.deepEqual(templateRoute([inactive, categoryTag], 'activity:sapiens'), { group: 'category', tag: 'etc' });
for (const viewMode of ['line', 'grid']) {
    for (const links of [[{ tags: null }, inactive, active], [{ tags: null }, inactive], []]) {
        const html = renderToStaticMarkup(React.createElement(TemplateCard, {
            item: { id: 1, title: 'Test Template', template_tags: links },
            viewMode, creatorName: 'Creator',
        }));
        assert.ok(html.includes('Test Template'));
        assert.ok(!html.includes('Hidden Party'));
        assert.equal(html.includes('Golden Gather'), links.includes(active));
    }
}
const Breadcrumbs = loadTs('components/Breadcrumbs.tsx', {
    '@/lib/dashboard': loadTs('lib/dashboard.ts', { './routes': routes }),
    '@/lib/routes': routes,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
}).default;
const breadcrumb = renderToStaticMarkup(React.createElement(Breadcrumbs, {
    path: 'sapiens:golden-gather', currentFile: 'Golden Gather', editorMode: 'EDITOR',
}));
assert.ok(!breadcrumb.includes('HUMAN_PARTY'));
assert.ok(!breadcrumb.includes('href="/?group=sapiens&amp;tag=all"'));
assert.ok(breadcrumb.includes('href="/?group=sapiens&amp;tag=golden-gather"'));
assert.ok(breadcrumb.includes('Golden_Gather'));
assert.ok(breadcrumb.includes('EDITOR'));
const encoded = renderToStaticMarkup(React.createElement(Breadcrumbs, {
    path: 'shops:food&drink', currentFile: 'Shop', editorMode: 'EDIT',
}));
assert.ok(encoded.includes('tag=food%26drink'));
const dashboard = renderToStaticMarkup(React.createElement(Breadcrumbs, { path: 'shops:potted-greenhouse' }));
assert.ok(dashboard.includes('SHOPS'));
function findButton(element, title) {
    if (!React.isValidElement(element)) return;
    if (element.type === 'button' && element.props.title === title) return element;
    for (const child of React.Children.toArray(element.props.children)) {
        const found = findButton(child, title);
        if (found) return found;
    }
}
// Enter from a specific tag even when ETC is the first template tag.
for (const [group, slug, title] of [
    ['houses', 'the-plastics', 'The Plastics Roleplay [Guests]'],
    ['shops', 'potted-greenhouse', 'Potted Greenhouse Order Form'],
]) {
    const links = [
        { tags: { is_active: true, slug: 'etc', tag_groups: { name: 'category' } } },
        { tags: { is_active: true, slug, tag_groups: { name: group } } },
    ];
    for (const viewMode of ['line', 'grid']) {
        const card = TemplateCard({ item: { id: 42, template_tags: links }, viewMode,
            activeFilter: `${group}:${slug}`, canManage: true });
        findButton(card, 'Use Template').props.onClick({ stopPropagation() {} });
        assert.equal(navigations.pop(), `/editor/42?group=${group}&tag=${slug}`);
        findButton(card, 'Edit Template').props.onClick({ stopPropagation() {} });
        assert.equal(navigations.pop(), `/edit/42?group=${group}&tag=${slug}`);
    }
    for (const editorMode of ['EDITOR', 'EDIT']) {
        const route = templateRoute(links, `${group}:${slug}`);
        const html = renderToStaticMarkup(React.createElement(Breadcrumbs, {
            path: `${route.group}:${route.tag}`, currentFile: title, editorMode,
        }));
        const text = html.replace(/<[^>]+>/g, '');
        assert.equal(text, `ZZZCODE_EDITOR/${slug.replace(/-/g, '_').toUpperCase()}/${title.replace(/\s+/g, '_')}/${editorMode}`);
        assert.ok(html.includes(`href="/?group=${group}&amp;tag=${slug}"`));
    }
}
for (const viewMode of ['line', 'grid']) {
    let activated = false;
    const props = { item: { id: 42, is_active: false, title: 'Inactive Template', template_tags: [] },
        viewMode, canManage: true, onActivate: () => { activated = true; } };
    const html = renderToStaticMarkup(React.createElement(TemplateCard, props));
    assert.ok(html.includes('opacity-50'));
    assert.ok(!html.includes('INACTIVE'));
    assert.ok(html.includes('Activate Template'));
    const card = TemplateCard(props);
    assert.ok(!card.props.className.includes('grayscale'));
    assert.ok(!card.props.className.includes('opacity-50'));
    assert.equal(card.props['data-inactive'], true);
    assert.ok(!card.props.className.includes('hover:opacity'));
    assert.ok(!card.props.className.includes('focus-within:opacity'));
    assert.ok(!html.includes('group-hover:scale-105'));
    const activateIcon = findButton(card, 'Activate Template').props.children;
    assert.equal(activateIcon.type, 'svg');
    assert.equal(activateIcon.props.width, '14');
    assert.equal(activateIcon.props.height, '14');
    assert.equal(activateIcon.props.fill, 'currentColor');
    const taggedHtml = renderToStaticMarkup(React.createElement(TemplateCard, {
        ...props,
        item: { ...props.item, template_tags: [1, 2, 3, 4].map(id => ({ tags: {
            slug: `tag-${id}`, name: `Tag ${id}`, is_active: true, tag_groups: { name: 'category' },
        } })) },
    }));
    assert.equal((taggedHtml.match(/zzzcode-tag-btn/g) || []).length, viewMode === 'grid' ? 2 : 4);
    if (viewMode === 'grid') assert.ok(taggedHtml.includes('zzzcode-tooltip-btn'));
    assert.ok(findButton(card, 'Edit Template'));
    assert.ok(findButton(card, 'Use Template'));
    assert.equal(findButton(card, 'Delete / Deactivate'), undefined);
    findButton(card, 'Activate Template').props.onClick({ stopPropagation() {} });
    assert.equal(activated, true);
    assert.equal(findButton(TemplateCard({ ...props, isActivating: true }), 'Activate Template').props.disabled, true);
    assert.equal(renderToStaticMarkup(React.createElement(TemplateCard, { ...props, canManage: false })), '');
    const restored = TemplateCard({ ...props, item: { ...props.item, is_active: true } });
    assert.ok(findButton(restored, 'Delete / Deactivate'));
    assert.equal(findButton(restored, 'Activate Template'), undefined);
}
console.log('Template tags, card layouts, inactive controls and breadcrumb links passed.');

for (const group of ['category', 'css', 'style']) {
    const tags = [{id:30,name:'Alpha'}, {id:2,name:'Zulu'}, {id:10,name:'Middle'}].map(tag => ({...tag, slug:tag.name.toLowerCase(),tag_groups:{name:group}}));
    assert.deepEqual(routes.sortTagsByGroup(tags).map(t=>t.id), [2,10,30]);
    const entries = tags.map(tags=>({tags:{...tags,is_active:true}}));
    assert.deepEqual(loaded.exports.sortedVisibleTemplateTags(entries).map(t=>t.tags.id),[2,10,30]);
    assert.deepEqual([...tags].sort((a,b)=>routes.compareTagOrder(group,a,b)).map(t=>t.id),[2,10,30]);
    assert.ok(routes.compareTagOrder(group,{id:'10'},{id:'2'}) > 0);
    assert.ok(routes.compareTagOrder(group,{id:10},{name:'Unknown'}) < 0);
}
assert.ok(routes.compareTagOrder('activity',{id:30,name:'Alpha'},{id:2,name:'Zulu'}) < 0);
console.log('Category/CSS/style ID order, appended new tags and other groups alphabetical order passed.');

const { isHogthaiTemplate, dashboardTagUrl, HOGTHAI_GROUPS } = loadTs('lib/dashboard.ts', { './routes': routes });
const hogthaiTag = { tags: { is_active: true, name: 'Hogthai', slug: 'hogthai', tag_groups: { name: 'style' } } };
assert.equal(isHogthaiTemplate([hogthaiTag, active]), true);
assert.equal(isHogthaiTemplate([{ tags: null }, active]), false);
assert.equal(isHogthaiTemplate(null), false);
assert.equal(isHogthaiTemplate([{ tags: { slug: ' HOGTHAI ' } }]), true);
assert.deepEqual(HOGTHAI_GROUPS, ['creators', 'category', 'css', 'style']);
assert.equal(dashboardTagUrl('css', 'minimal', true), '/hogthai?group=css&tag=minimal');
assert.equal(dashboardTagUrl('style', 'modern', true), '/hogthai?group=style&tag=modern');
assert.equal(dashboardTagUrl('style', 'hogthai'), '/hogthai');
assert.equal(dashboardTagUrl('category', 'etc', true), '/hogthai?group=category&tag=etc');
assert.equal(dashboardTagUrl('creators', 'author', true), '/hogthai?group=creators&tag=author');
assert.equal(dashboardTagUrl('activity', 'party', true), '/hogthai');
assert.equal(dashboardTagUrl('category', 'food&drink'), '/?group=category&tag=food%26drink');
// Exercise the actual dashboard filter, including search, tag and password filters.
const dashboardSource = fs.readFileSync('components/TemplateDashboard.tsx', 'utf8');
const filterBody = dashboardSource.slice(dashboardSource.indexOf('const result = templates.filter'), dashboardSource.indexOf('const sortedResult'));
const filterCatalog = new Function('templates', 'hogthai', 'activeFilter', 'searchQuery', 'noPassOnly', 'passOnly', 'isHogthaiTemplate', 'getGroupSlug', 'creatorSession', 'canManageTemplate', ts.transpileModule(`${filterBody}\nreturn result;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText);
const catalog = [
    { id: 1, title: 'Public Chat', is_active: true, is_personal: false, template_tags: [hogthaiTag, categoryTag, creatorTag] },
    { id: 2, title: 'Private Chat', is_active: true, is_personal: true, template_tags: [hogthaiTag, categoryTag] },
    { id: 3, title: 'Regular Chat', is_active: true, is_personal: false, template_tags: [categoryTag] },
];
const ids = (hogthai, path = 'category:all', query = '', noPass = false, pass = false) => filterCatalog(catalog, hogthai, path, query, noPass, pass, isHogthaiTemplate, routes.getGroupSlug, null, () => false).map(t => t.id);
assert.deepEqual(ids(false), [3]);
const inactiveCatalog = [{ ...catalog[2], is_active: false, user_id: 'owner' }];
const visibility = (session) => filterCatalog(inactiveCatalog, false, 'category:all', '', false, false,
    isHogthaiTemplate, routes.getGroupSlug, session, (current, owner) => current.userId === owner);
assert.equal(visibility(null).length, 0, 'Inactive templates stay hidden while identity loads');
assert.equal(visibility({ userId: 'other' }).length, 0);
assert.equal(visibility({ userId: 'owner' }).length, 1, 'Owner templates appear after identity resolves');
assert.deepEqual(ids(true), [1, 2]);
assert.deepEqual(ids(true, 'creators:author'), [1]);
assert.deepEqual(ids(true, 'category:etc', 'Private'), [2]);
assert.deepEqual(ids(true, 'category:all', '', true), [1]);
assert.deepEqual(ids(true, 'category:all', '', false, true), [2]);
for (const viewMode of ['line', 'grid']) {
    const card = TemplateCard({ item: { id: 1, template_tags: [hogthaiTag, categoryTag] }, viewMode });
    findButton(card, 'Use Template').props.onClick({ stopPropagation() {} });
    assert.equal(navigations.pop(), '/editor/1?group=category&tag=etc');
    function tagButtons(element) {
        if (!React.isValidElement(element)) return [];
        return (element.type === 'button' && element.props.className?.includes('zzzcode-tag-btn') ? [element] : [])
            .concat(React.Children.toArray(element.props.children).flatMap(tagButtons));
    }
    for (const button of tagButtons(card)) {
        button.props.onClick({ stopPropagation() {} });
        assert.equal(navigations.pop(), button.props.children === 'Hogthai' ? '/hogthai' : '/hogthai?group=category&tag=etc');
    }
}
const hogthaiBreadcrumb = renderToStaticMarkup(React.createElement(Breadcrumbs, { path: 'category:etc', dashboardBase: '/hogthai' }));
assert.ok(hogthaiBreadcrumb.includes('/hogthai?group=category&amp;tag=all'));
assert.ok(hogthaiBreadcrumb.includes('href="/hogthai"'));
const hogthaiEditorBreadcrumb = renderToStaticMarkup(React.createElement(Breadcrumbs, {
    path: 'category:etc', currentFile: 'Chat', editorMode: 'EDITOR', dashboardBase: '/hogthai',
}));
assert.ok(hogthaiEditorBreadcrumb.includes('href="/hogthai"'));
assert.ok(hogthaiEditorBreadcrumb.includes('href="/hogthai?group=category&amp;tag=etc"'));
assert.ok(!hogthaiEditorBreadcrumb.includes('dashboard='));
console.log('Hogthai catalog separation, combined filters, card navigation and breadcrumbs passed.');

for (const contextHref of ['/hogthai', '/?group=category&tag=all']) {
    const Header = loadTs('components/TypingHeader.tsx', {
        react: { ...React, useState: () => ['', () => {}], useEffect: () => {} },
        'next/link': { default: 'a' },
        './DashboardContext': { useDashboardHref: () => contextHref },
    }).default;
    assert.equal(Header({ text: 'zzzcode editor' }).props.href, contextHref);
}
console.log('Header follows the template dashboard context without a dashboard query parameter.');
