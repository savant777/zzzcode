"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import Modal from '@/components/Modal';
import { CreatorSession, requireCreator } from '@/lib/creator';
import { getGroupSlug } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

type TagGroup = {
    id: number;
    name: string;
};

type ManagedTag = {
    id: number;
    group_id: number;
    user_id: string | null;
    name: string;
    slug: string;
    is_active: boolean;
    tag_groups?: TagGroup | null;
};

type SortKey = 'name' | 'slug' | 'group' | 'owner' | 'status';
type SortDirection = 'asc' | 'desc';

type TagForm = {
    group_id: string;
    name: string;
    slug: string;
    is_active: boolean;
};

const GROUP_ORDER = ['category', 'css', 'style', 'activity', 'commission', 'the-plastics'];
const OWNER_ONLY_GROUPS = ['the-plastics'];

const emptyForm: TagForm = {
    group_id: '',
    name: '',
    slug: '',
    is_active: true,
};

const slugify = (value: string) => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

const getTagGroup = (tag: ManagedTag) => tag.tag_groups?.name || 'unknown';

const sortTagGroups = (groups: TagGroup[]) => {
    return [...groups].sort((a, b) => {
        const orderA = GROUP_ORDER.indexOf(getGroupSlug(a.name));
        const orderB = GROUP_ORDER.indexOf(getGroupSlug(b.name));
        const safeOrderA = orderA === -1 ? GROUP_ORDER.length : orderA;
        const safeOrderB = orderB === -1 ? GROUP_ORDER.length : orderB;

        if (safeOrderA !== safeOrderB) return safeOrderA - safeOrderB;
        return a.name.localeCompare(b.name);
    });
};

const getTagOwnerLabel = (
    tag: ManagedTag,
    currentUserId?: string,
    currentDisplayName?: string,
    creatorNames: Record<string, string> = {}
) => {
    if (tag.user_id === null) return 'global';
    if (tag.user_id === currentUserId) return currentDisplayName || creatorNames[tag.user_id] || 'mine';
    return creatorNames[tag.user_id] || 'creator';
};

const getSortValue = (
    tag: ManagedTag,
    sortKey: SortKey,
    currentUserId?: string,
    currentDisplayName?: string,
    creatorNames: Record<string, string> = {}
) => {
    if (sortKey === 'name') return tag.name;
    if (sortKey === 'slug') return tag.slug;
    if (sortKey === 'group') return getTagGroup(tag);
    if (sortKey === 'owner') return getTagOwnerLabel(tag, currentUserId, currentDisplayName, creatorNames);
    return tag.is_active ? 'active' : 'inactive';
};

const sortTags = (
    tags: ManagedTag[],
    sortKey: SortKey,
    sortDirection: SortDirection,
    currentUserId?: string,
    currentDisplayName?: string,
    creatorNames: Record<string, string> = {}
) => {
    return [...tags].sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1;

        if (sortKey === 'group') {
            const groupA = getGroupSlug(getTagGroup(a));
            const groupB = getGroupSlug(getTagGroup(b));
            const orderA = GROUP_ORDER.indexOf(groupA);
            const orderB = GROUP_ORDER.indexOf(groupB);
            const safeOrderA = orderA === -1 ? GROUP_ORDER.length : orderA;
            const safeOrderB = orderB === -1 ? GROUP_ORDER.length : orderB;

            if (safeOrderA !== safeOrderB) return (safeOrderA - safeOrderB) * direction;
        }

        return String(getSortValue(a, sortKey, currentUserId, currentDisplayName, creatorNames))
            .localeCompare(String(getSortValue(b, sortKey, currentUserId, currentDisplayName, creatorNames))) * direction;
    });
};

export default function ManageTagsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
    const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
    const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
    const [tags, setTags] = useState<ManagedTag[]>([]);
    const [modalType, setModalType] = useState<'add' | 'edit' | 'delete' | null>(null);
    const [selectedTag, setSelectedTag] = useState<ManagedTag | null>(null);
    const [isSlugEdited, setIsSlugEdited] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [sortKey, setSortKey] = useState<SortKey>('group');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [form, setForm] = useState<TagForm>(emptyForm);

    const currentUserId = creatorSession?.user?.id;
    const currentDisplayName = creatorSession?.creator?.display_name;

    const filteredTags = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return tags.filter(tag => {
            const groupSlug = getGroupSlug(getTagGroup(tag));
            const ownerLabel = getTagOwnerLabel(tag, currentUserId, currentDisplayName, creatorNames);

            const matchesSearch = !query || [
                tag.name,
                tag.slug,
                getTagGroup(tag),
                ownerLabel,
                tag.is_active ? 'active' : 'inactive',
            ].some(value => value.toLowerCase().includes(query));

            const matchesGroup = groupFilter === 'all' || groupSlug === groupFilter;
            const matchesStatus = statusFilter === 'all'
                || (statusFilter === 'active' && tag.is_active)
                || (statusFilter === 'inactive' && !tag.is_active);
            const matchesOwner = ownerFilter === 'all'
                || (ownerFilter === 'global' && tag.user_id === null)
                || tag.user_id === ownerFilter;

            return matchesSearch && matchesGroup && matchesStatus && matchesOwner;
        });
    }, [tags, searchQuery, groupFilter, statusFilter, ownerFilter, currentUserId, currentDisplayName, creatorNames]);

    const sortedTags = useMemo(
        () => sortTags(filteredTags, sortKey, sortDirection, currentUserId, currentDisplayName, creatorNames),
        [filteredTags, sortKey, sortDirection, currentUserId, currentDisplayName, creatorNames]
    );

    const ownerOptions = useMemo(() => {
        const ownerIds = Array.from(new Set(tags.map(tag => tag.user_id).filter((id): id is string => !!id)));

        return ownerIds
            .map(userId => ({
                userId,
                label: userId === currentUserId ? currentDisplayName || creatorNames[userId] || 'mine' : creatorNames[userId] || 'creator',
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [tags, currentUserId, currentDisplayName, creatorNames]);

    const canManageTag = (tag: ManagedTag) => {
        if (!creatorSession?.user || !creatorSession.isCreator) return false;
        if (creatorSession.isOwner) return true;
        if (OWNER_ONLY_GROUPS.includes(getGroupSlug(getTagGroup(tag)))) return false;
        return tag.user_id === creatorSession.user.id;
    };

    const availableTagGroups = useMemo(() => {
        if (creatorSession?.isOwner) return tagGroups;
        return tagGroups.filter(group => !OWNER_ONLY_GROUPS.includes(getGroupSlug(group.name)));
    }, [tagGroups, creatorSession?.isOwner]);

    const handleSort = (nextKey: SortKey) => {
        if (sortKey === nextKey) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }

        setSortKey(nextKey);
        setSortDirection('asc');
    };

    const sortIndicator = (key: SortKey) => sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '';

    const loadTags = async () => {
        const session = await requireCreator();

        if (!session.user) {
            toast.error("ERROR_ACCESS_DENIED: LOGIN_REQUIRED");
            router.replace('/?group=category&tag=all');
            return;
        }

        if (!session.canAccessCreatorTools) {
            toast.error("ERROR_ACCESS_DENIED: CREATOR_REQUIRED");
            router.replace('/?group=category&tag=all');
            return;
        }

        setCreatorSession(session);

        const { data: groupsData, error: groupsError } = await supabase
            .from('tag_groups')
            .select('id, name');

        const { data: creatorsData } = await supabase
            .from('creators')
            .select('user_id, display_name')
            .eq('is_active', true);

        if (groupsError) {
            toast.error(`TAG_GROUP_LOAD_FAILED: ${groupsError.message}`);
            setLoading(false);
            return;
        }

        const manageableGroups = sortTagGroups((groupsData || []).filter(group => getGroupSlug(group.name) !== 'creators'));
        setTagGroups(manageableGroups);
        if (creatorsData) {
            setCreatorNames(creatorsData.reduce((acc: Record<string, string>, creator: any) => {
                acc[creator.user_id] = creator.display_name;
                return acc;
            }, {}));
        }

        const tagQuery = session.isOwner
            ? supabase
                .from('tags')
                .select('id, group_id, user_id, name, slug, is_active, tag_groups(id, name)')
            : supabase
                .from('tags')
                .select('id, group_id, user_id, name, slug, is_active, tag_groups(id, name)')
                .or(`user_id.is.null,user_id.eq.${session.user.id}`);

        const { data: tagsData, error: tagsError } = await tagQuery;

        if (tagsError) {
            toast.error(`TAG_LOAD_FAILED: ${tagsError.message}`);
            setLoading(false);
            return;
        }

        const nextTags = (tagsData || [])
            .filter((tag: any) => getGroupSlug(tag.tag_groups?.name) !== 'creators')
            .map((tag: any) => ({
                ...tag,
                slug: tag.slug || '',
                is_active: tag.is_active ?? true,
            }));

        setTags(nextTags);
        setLoading(false);
    };

    useEffect(() => {
        loadTags();
    }, []);

    const openAddModal = () => {
        setIsSlugEdited(false);
        setSelectedTag(null);
        setForm({
            ...emptyForm,
            group_id: availableTagGroups[0]?.id ? String(availableTagGroups[0].id) : '',
        });
        setModalType('add');
    };

    const openEditModal = (tag: ManagedTag) => {
        if (!canManageTag(tag)) return;

        setIsSlugEdited(true);
        setSelectedTag(tag);
        setForm({
            group_id: String(tag.group_id),
            name: tag.name,
            slug: tag.slug || '',
            is_active: tag.is_active,
        });
        setModalType('edit');
    };

    const openDeleteModal = (tag: ManagedTag) => {
        setSelectedTag(tag);
        setModalType('delete');
    };

    const closeModal = () => {
        if (saving) return;
        setModalType(null);
        setSelectedTag(null);
        setIsSlugEdited(false);
        setForm(emptyForm);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!creatorSession?.user || !creatorSession.isCreator) return;

        const nextTag = {
            group_id: Number(form.group_id),
            name: form.name.trim(),
            slug: slugify(form.slug || form.name),
            is_active: form.is_active,
        };

        if (!nextTag.group_id || !nextTag.name || !nextTag.slug) {
            toast.error("TAG_INVALID: GROUP_NAME_AND_SLUG_REQUIRED");
            return;
        }

        const nextGroup = tagGroups.find(group => group.id === nextTag.group_id);
        if (!creatorSession.isOwner && OWNER_ONLY_GROUPS.includes(getGroupSlug(nextGroup?.name))) {
            toast.error("TAG_GROUP_LOCKED: OWNER_ONLY");
            return;
        }

        setSaving(true);
        const toastId = toast.loading(modalType === 'add' ? "SYSTEM: Creating_Tag..." : "SYSTEM: Updating_Tag...");

        try {
            if (modalType === 'add') {
                const { error } = await supabase
                    .from('tags')
                    .insert([{
                        ...nextTag,
                        user_id: creatorSession.isOwner ? null : creatorSession.user.id,
                    }]);

                if (error) throw error;
                toast.success("TAG_CREATED", { id: toastId });
            }

            if (modalType === 'edit' && selectedTag) {
                if (!canManageTag(selectedTag)) {
                    throw new Error("TAG_OWNER_REQUIRED");
                }

                const { error } = await supabase
                    .from('tags')
                    .update(nextTag)
                    .eq('id', selectedTag.id);

                if (error) throw error;
                toast.success("TAG_UPDATED", { id: toastId });
            }

            closeModal();
            await loadTags();
        } catch (error: any) {
            toast.error(`TAG_SAVE_FAILED: ${error.message}`, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!selectedTag || !canManageTag(selectedTag)) return;

        setSaving(true);
        const toastId = toast.loading("SYSTEM: Deactivating_Tag...");

        try {
            const { error } = await supabase
                .from('tags')
                .update({ is_active: false })
                .eq('id', selectedTag.id);

            if (error) throw error;

            closeModal();
            toast.success("TAG_DEACTIVATED", { id: toastId });
            await loadTags();
        } catch (error: any) {
            toast.error(`TAG_DEACTIVATE_FAILED: ${error.message}`, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs editorMode="MANAGE_TAGS" />
                </div>

                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Loading_Tag_Index...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs editorMode="MANAGE_TAGS" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <div className="mx-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4 py-4 max-lg:py-2 border-b border-(--primary)">
                <div className="flex items-center justify-between gap-3">
                    {/* Title */}
                    <h1 className="text-3xl md:text-5xl font-Monomaniac-One text-(--primary) uppercase leading-none">
                        Manage_Tags
                    </h1>
                    <button
                        type="button"
                        onClick={openAddModal}
                        className="lg:hidden shrink-0 bg-(--primary) px-2 py-1 text-xs font-black uppercase text-(--background) transition-all hover:brightness-110 cursor-pointer"
                    >
                        + Add
                    </button>
                </div>
                {/* Filters & Tools */}
                <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] uppercase">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px] md:flex-none" suppressHydrationWarning>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="SEARCH..."
                            className="h-[28px] w-full bg-transparent border border-(--primary)/30 p-1 pl-2 pr-8 focus:border-(--primary) outline-none transition-all placeholder:text-(--foreground)/30"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-(--primary)/50 pointer-events-none">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                    </div>

                    {/* filter */}
                    <div className="flex min-w-0 flex-1 basis-full items-center gap-3 md:basis-auto">
                        <div className="shrink-0">Filter:</div>

                        <select
                            value={groupFilter}
                            onChange={(event) => setGroupFilter(event.target.value)}
                            className="h-[28px] min-w-0 flex-1 truncate bg-transparent border border-(--primary)/30 px-2 outline-none cursor-pointer hover:border-(--primary) text-(--primary) lg:max-w-[130px]"
                        >
                            <option value="all" className="bg-black">ALL_GROUPS</option>
                            {tagGroups.map(group => (
                                <option key={group.id} value={getGroupSlug(group.name)} className="bg-black">
                                    {group.name}
                                </option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="h-[28px] min-w-0 flex-1 truncate bg-transparent border border-(--primary)/30 px-2 outline-none cursor-pointer hover:border-(--primary) text-(--primary) lg:max-w-[120px]"
                        >
                            <option value="all" className="bg-black">ALL_STATUS</option>
                            <option value="active" className="bg-black">ACTIVE</option>
                            <option value="inactive" className="bg-black">INACTIVE</option>
                        </select>

                        <select
                            value={ownerFilter}
                            onChange={(event) => setOwnerFilter(event.target.value)}
                            className="h-[28px] min-w-0 flex-1 truncate bg-transparent border border-(--primary)/30 px-2 outline-none cursor-pointer hover:border-(--primary) text-(--primary) lg:max-w-[130px]"
                        >
                            <option value="all" className="bg-black">ALL_OWNERS</option>
                            <option value="global" className="bg-black">GLOBAL</option>
                            {ownerOptions.map(owner => (
                                <option key={owner.userId} value={owner.userId} className="bg-black">
                                    {owner.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={openAddModal}
                        className="hidden lg:block shrink-0 bg-(--primary) px-2 py-1 text-xs font-black uppercase text-(--background) transition-all hover:brightness-110 cursor-pointer"
                    >
                        + Add_Tag
                    </button>
                </div>
            </div>

            <div className="flex-1 m-4 overflow-auto scrollbar-hide">
                <table className="w-full min-w-[600px] border-separate border-spacing-0 text-left text-xs">
                    <thead className="uppercase tracking-widest text-(--foreground) bg-(--background)">
                        <tr className="">
                            <th className="sticky top-0 left-0 z-30 bg-(--background) border-b border-(--primary)">
                                <button type="button" onClick={() => handleSort('name')} className="w-full p-3 bg-(--primary)/40 text-left cursor-pointer hover:bg-(--primary)/55">
                                    Tag{sortIndicator('name')}
                                </button>
                            </th>
                            <th className="sticky top-0 z-20 bg-(--background) border-b border-(--primary)">
                                <button type="button" onClick={() => handleSort('slug')} className="w-full p-3 bg-(--primary)/40 text-left cursor-pointer hover:bg-(--primary)/55">
                                    Slug{sortIndicator('slug')}
                                </button>
                            </th>
                            <th className="sticky top-0 z-20 bg-(--background) border-b border-(--primary)">
                                <button type="button" onClick={() => handleSort('group')} className="w-full p-3 bg-(--primary)/40 text-left cursor-pointer hover:bg-(--primary)/55">
                                    Group{sortIndicator('group')}
                                </button>
                            </th>
                            <th className="sticky top-0 z-20 bg-(--background) border-b border-(--primary)">
                                <button type="button" onClick={() => handleSort('owner')} className="w-full p-3 bg-(--primary)/40 text-left cursor-pointer hover:bg-(--primary)/55">
                                    Owner{sortIndicator('owner')}
                                </button>
                            </th>
                            <th className="sticky top-0 z-20 bg-(--background) border-b border-(--primary)">
                                <button type="button" onClick={() => handleSort('status')} className="w-full p-3 bg-(--primary)/40 text-left cursor-pointer hover:bg-(--primary)/55">
                                    Status{sortIndicator('status')}
                                </button>
                            </th>
                            <th className="sticky top-0 z-20 bg-(--background) text-right border-b border-(--primary)">
                                <div className="p-3 bg-(--primary)/40">Actions</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTags.map(tag => {
                            const isManageable = canManageTag(tag);
                            const isGlobal = tag.user_id === null;
                            const ownerLabel = getTagOwnerLabel(tag, currentUserId, currentDisplayName, creatorNames);

                            return (
                                <tr key={tag.id} className="group border-b border-(--primary)/20 hover:bg-(--primary)/5">
                                    <td className="sticky left-0 z-10 w-48 border-b border-(--primary)/20 bg-(--background) font-Google-Sans text-sm text-(--primary)">
                                        <div className="p-3 group-hover:bg-(--primary)/5">{tag.name}</div>
                                    </td>
                                    <td className="border-b border-(--primary)/20 p-3 font-Google-Sans text-(--foreground)/70">{tag.slug}</td>
                                    <td className="border-b border-(--primary)/20 p-3 uppercase text-(--foreground)/70">{getTagGroup(tag)}</td>
                                    <td className="border-b border-(--primary)/20 p-3 uppercase text-(--foreground)/45">
                                        {isGlobal ? 'global' : ownerLabel}
                                    </td>
                                    <td className="border-b border-(--primary)/20 p-3">
                                        <span className={tag.is_active ? 'text-emerald-400' : 'text-red-400'}>
                                            {tag.is_active ? 'active' : 'inactive'}
                                        </span>
                                    </td>
                                    <td className="border-b border-(--primary)/20 p-3 text-right">
                                        {isManageable ? (
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditModal(tag)}
                                                    title="Edit Tag"
                                                    className="p-1.5 border border-(--primary)/30 text-(--primary) hover:bg-(--primary) hover:text-black focus:bg-(--primary) focus:text-black transition-colors duration-300 ease cursor-pointer"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                                onClick={() => openDeleteModal(tag)}
                                                                title="Deactivate Tag"
                                                                className="p-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white transition-colors duration-300 ease cursor-pointer"
                                                            >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] uppercase tracking-widest text-(--foreground)/25">Readonly</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}

                        {sortedTags.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-10 text-center text-[10px] uppercase tracking-widest text-(--foreground)/25">
                                    No_Tags_Found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={modalType === 'add' || modalType === 'edit'}
                onClose={closeModal}
                title={modalType === 'add' ? 'Add Tag' : 'Edit Tag'}
            >
                <form onSubmit={handleSubmit} className="space-y-4 text-(--foreground)">
                    <div className="space-y-1">
                        <label className="block text-[10px] uppercase opacity-70">Group</label>
                        <select
                            required
                            value={form.group_id}
                            onChange={(event) => setForm(prev => ({ ...prev, group_id: event.target.value }))}
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                        >
                            {availableTagGroups.map(group => (
                                <option key={group.id} value={group.id} className="bg-black">
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-[10px] uppercase opacity-70">Tag_Name</label>
                        <input
                            type="text"
                            required
                            value={form.name}
                            onChange={(event) => {
                                const nextName = event.target.value;
                                setForm(prev => ({
                                    ...prev,
                                    name: nextName,
                                    slug: isSlugEdited ? prev.slug : slugify(nextName),
                                }));
                            }}
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-[10px] uppercase opacity-70">Slug</label>
                        <input
                            type="text"
                            required
                            value={form.slug}
                            onChange={(event) => {
                                setIsSlugEdited(true);
                                setForm(prev => ({ ...prev, slug: slugify(event.target.value) }));
                            }}
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                        />
                    </div>

                    <label className="block mt-6 flex items-center gap-3 text-xs uppercase text-(--foreground)/75 cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={form.is_active}
                            onChange={(event) => setForm(prev => ({ ...prev, is_active: event.target.checked }))}
                        />
                        <span className="flex h-5 w-5 items-center justify-center border border-(--primary)/50 bg-black/20">
                            {form.is_active && <span className="h-3 w-3 bg-(--primary)" />}
                        </span>
                        Active_Tag
                    </label>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                        >
                            Abort
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="cursor-pointer flex-1 py-2 bg-(--primary) text-black font-bold uppercase text-xs hover:brightness-110 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : modalType === 'add' ? 'Create_Tag' : 'Save_Tag'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={modalType === 'delete'}
                onClose={closeModal}
                title="Deactivate Tag"
            >
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="16" x2="12" y2="18"></line>
                        </svg>
                        <span className="text-xs uppercase font-black tracking-[0.2em]">Destructive_Action</span>
                    </div>

                    <div className="space-y-2">
                        <p className="text-white/60 text-xs leading-relaxed">
                            คุณแน่ใจหรือไม่ที่จะลบ <span className="text-red-400 font-bold">"{selectedTag?.name}"</span>?
                        </p>
                        <p className="text-[10px] text-white/40 uppercase leading-tight">
                            Warning: This will de-activate the tag from public use. 
                            Internal ID_{selectedTag?.id.toString().padStart(3, '0')} will be archived.
                        </p>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                        >
                            Abort
                        </button>
                        <button
                            type="button"
                            onClick={handleDeactivate}
                            disabled={saving}
                            className="cursor-pointer flex-1 py-2 bg-red-600 text-white font-bold uppercase text-xs hover:bg-red-500 disabled:opacity-50"
                        >
                            {saving ? 'Processing...' : 'Confirm_Delete'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
