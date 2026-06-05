export const getGroupSlug = (name?: string | null) => {
    return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
};
