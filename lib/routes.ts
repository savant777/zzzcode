export const PRIMARY_ROUTE_GROUPS = ['activity', 'sapiens', 'houses', 'shops', 'commission'];
export const TAG_GROUP_ORDER = ['creators', 'category', 'css', 'style', 'activity', 'sapiens', 'houses', 'shops', 'commission'];

export function sortTagsByGroup<T extends { tag_groups?: { name?: string | null } | { name?: string | null }[] | null }>(tags: T[]): T[] {
    const rank = (tag: T) => {
        const group = Array.isArray(tag.tag_groups) ? tag.tag_groups[0] : tag.tag_groups;
        const index = TAG_GROUP_ORDER.indexOf(getGroupSlug(group?.name));
        return index === -1 ? TAG_GROUP_ORDER.length : index;
    };
    return [...tags].sort((a, b) => rank(a) - rank(b));
}

export const getGroupSlug = (name?: string | null) => {
    return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
};
