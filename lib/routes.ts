export const PRIMARY_ROUTE_GROUPS = ['activity', 'human-party', 'houses', 'shops', 'commission'];

export const getGroupSlug = (name?: string | null) => {
    return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
};
