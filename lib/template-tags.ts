import { getGroupSlug, PRIMARY_ROUTE_GROUPS } from './routes';

type TagEntry = {
    tags: {
        is_active?: boolean | null;
        slug?: string | null;
        tag_groups?: { name?: string | null } | null;
    } | null;
};

// RLS can return a join row with tags=null; owners can also see inactive tags.
export function visibleTemplateTags<T extends TagEntry>(entries?: T[] | null): T[] {
    return (entries || []).filter(entry => entry?.tags?.is_active === true
        && !!entry.tags.slug && !!entry.tags.tag_groups?.name);
}

export function templateRoute(entries?: TagEntry[] | null, preferredPath?: string) {
    const tags = visibleTemplateTags(entries);
    const [, rawTag] = (preferredPath || '').split(':');
    const tag = (rawTag || '').toLowerCase();
    const primaryTags = tags.filter(entry =>
        PRIMARY_ROUTE_GROUPS.includes(getGroupSlug(entry.tags?.tag_groups?.name)));
    const candidates = primaryTags.length ? primaryTags : tags.filter(entry =>
        getGroupSlug(entry.tags?.tag_groups?.name) === 'category');
    // The incoming tag only breaks ties within the eligible priority tier.
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
