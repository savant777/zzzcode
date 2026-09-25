import { getGroupSlug, PRIMARY_ROUTE_GROUPS } from './routes';

type TagEntry = {
    tags: {
        is_active?: boolean | null;
        slug?: string | null;
        name?: string | null;
        tag_groups?: { name?: string | null } | null;
    } | null;
};

const TEMPLATE_TAG_GROUP_ORDER = [
    'category',
    'css',
    'style',
    'activity',
    'sapiens',
    'houses',
    'shops',
    'commission',
    'creators',
];

export function sortedVisibleTemplateTags<T extends TagEntry>(entries?: T[] | null): T[] {
    return visibleTemplateTags(entries).sort((a, b) => {
        const groupA = getGroupSlug(a.tags?.tag_groups?.name);
        const groupB = getGroupSlug(b.tags?.tag_groups?.name);

        const indexA = TEMPLATE_TAG_GROUP_ORDER.indexOf(groupA);
        const indexB = TEMPLATE_TAG_GROUP_ORDER.indexOf(groupB);

        const orderA = indexA === -1 ? TEMPLATE_TAG_GROUP_ORDER.length : indexA;
        const orderB = indexB === -1 ? TEMPLATE_TAG_GROUP_ORDER.length : indexB;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        if (indexA === -1 && indexB === -1 && groupA !== groupB) {
            return groupA.localeCompare(groupB);
        }

        const nameA = a.tags?.name || a.tags?.slug || '';
        const nameB = b.tags?.name || b.tags?.slug || '';

        return nameA.localeCompare(nameB, undefined, {
            sensitivity: 'base',
        });
    });
}

// RLS can return a join row with tags=null; owners can also see inactive tags.
export function visibleTemplateTags<T extends TagEntry>(entries?: T[] | null): T[] {
    return (entries || []).filter(entry => entry?.tags?.is_active === true
        && !!entry.tags.slug && !!entry.tags.tag_groups?.name);
}

export function templateRoute(entries?: TagEntry[] | null, preferredPath?: string) {
    const tags = visibleTemplateTags(entries);
    const [, rawTag] = (preferredPath || '').split(':');
    const tag = (rawTag || '').toLowerCase();
    const preferredGroup = PRIMARY_ROUTE_GROUPS.find(group => tags.some(entry =>
        getGroupSlug(entry.tags?.tag_groups?.name) === group)) || 'category';
    const candidates = tags.filter(entry =>
        getGroupSlug(entry.tags?.tag_groups?.name) === preferredGroup);
    // The incoming tag only breaks ties within the highest-priority group.
    // Never let category, CSS or creator navigation override a primary tag.
    const selected = candidates.find(entry => entry.tags?.slug?.toLowerCase() === tag) || candidates[0];
    return {
        group: getGroupSlug(selected?.tags?.tag_groups?.name) || 'category',
        tag: selected?.tags?.slug?.toLowerCase() || 'all',
    };
}

// Only change selectable tags. Hidden/inactive relationships must survive edits.
export function templateTagChanges(existing: string[], selected: string[], selectable: string[]) {
    const allowed = new Set(selectable);
    const desired = new Set(selected.filter(id => allowed.has(id)));
    const current = new Set(existing);
    return {
        remove: [...current].filter(id => allowed.has(id) && !desired.has(id)),
        add: [...desired].filter(id => !current.has(id)),
    };
}
