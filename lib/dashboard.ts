import { getGroupSlug } from './routes';

export const HOGTHAI_GROUPS = ['creators', 'category', 'css', 'style'];

export function isHogthaiTemplate(entries?: { tags: { slug?: string | null } | null }[] | null) {
    return (entries || []).some(entry => entry.tags?.slug?.trim().toLowerCase() === 'hogthai');
}

export function dashboardTagUrl(groupName: string, tagSlug: string, hogthai = false) {
    const group = getGroupSlug(groupName);
    const tag = tagSlug.trim().toLowerCase();
    if (group === 'style' && tag === 'hogthai') return '/hogthai';
    if (hogthai && !HOGTHAI_GROUPS.includes(group)) return '/hogthai';
    return `${hogthai ? '/hogthai' : '/'}?${new URLSearchParams({ group, tag })}`;
}
