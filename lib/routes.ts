export const PRIMARY_ROUTE_GROUPS = ['activity', 'sapiens', 'houses', 'shops', 'commission'];
export const TAG_GROUP_ORDER = ['creators', 'category', 'css', 'style', 'activity', 'sapiens', 'houses', 'shops', 'commission'];

export function sortTagsByGroup<T extends { name?: string | null; tag_groups?: { name?: string | null } | { name?: string | null }[] | null }>(tags: T[]): T[] {
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
        || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}

export const getGroupSlug = (name?: string | null) => {
    return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
};
