export const PRIMARY_ROUTE_GROUPS = ['activity', 'sapiens', 'houses', 'shops', 'commission'];
export const TAG_GROUP_ORDER = ['creators', 'category', 'css', 'style', 'activity', 'sapiens', 'houses', 'shops', 'commission'];

// These groups follow database IDs, so newly created tags append automatically.
export function compareTagOrder(group: string, a: { id?: number | string | null; name?: string | null; slug?: string | null }, b: { id?: number | string | null; name?: string | null; slug?: string | null }) {
    if (['category', 'css', 'style'].includes(getGroupSlug(group))) {
        const id = (value: typeof a.id) => value != null && /^[0-9]+$/.test(String(value)) ? BigInt(value) : null;
        const left = id(a.id), right = id(b.id);
        if (left !== null && right !== null && left !== right) return left < right ? -1 : 1;
        if (left !== null && right === null) return -1;
        if (left === null && right !== null) return 1;
    }
    return (a.name || a.slug || '').localeCompare(b.name || b.slug || '', undefined, { sensitivity: 'base' });
}

export function sortTagsByGroup<T extends { id?: number | string | null; name?: string | null; slug?: string | null; tag_groups?: { name?: string | null } | { name?: string | null }[] | null }>(tags: T[]): T[] {
    const groupSlug = (tag: T) => {
        const group = Array.isArray(tag.tag_groups) ? tag.tag_groups[0] : tag.tag_groups;
        return getGroupSlug(group?.name);
    };
    const rank = (tag: T) => {
        const index = TAG_GROUP_ORDER.indexOf(groupSlug(tag));
        return index === -1 ? TAG_GROUP_ORDER.length : index;
    };
    return [...tags].sort((a, b) => rank(a) - rank(b)
        || groupSlug(a).localeCompare(groupSlug(b))
        || compareTagOrder(groupSlug(a), a, b));
}

export const getGroupSlug = (name?: string | null) => {
    return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
};
