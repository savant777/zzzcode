"use client";

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CreatorSession, canManageTemplate, getCurrentCreator } from '@/lib/creator';
import { getGroupSlug } from '@/lib/routes';
import { templateRoute, visibleTemplateTags } from '@/lib/template-tags';
import { getRememberedTemplateUnlock, rememberTemplateUnlock } from '@/lib/template-unlock';
import { deactivateTemplate, setTemplateActive } from '@/lib/template-actions';
import { toast } from 'sonner';

// Components
import SideNav from '@/components/SideNav';
import Breadcrumbs from '@/components/Breadcrumbs';
import TemplateCard from '@/components/TemplateCard';
import SkeletonCard from '@/components/SkeletonCard';
import PageLoading from '@/components/PageLoading';
import Modal from '@/components/Modal';
import TemplateSortFilter from '@/components/TemplateSortFilter';

type DashboardTemplate = {
    id: number;
    title: string;
    description: string | null;
    preview_url: string | null;
    user_id: string | null;
    is_active: boolean;
    is_personal: boolean;
    template_tags: { tags: {
        id: number;
        name: string;
        slug: string;
        is_active: boolean;
        tag_groups: { name: string } | null;
    } | null }[];
};

export default function Page() {
    return (
        <Suspense fallback={<PageLoading label="Loading_Dashboard..." />}>
            <Dashboard />
        </Suspense>
    )
}

function Dashboard() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // --- 1. States (Essential & Restored) ---
    const [isLoading, setIsLoading] = useState(true);
    const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
    const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
    const [templates, setTemplates] = useState<any[]>([]);
    
    // UI Controls
    const [isOpen, setIsOpen] = useState(true);
    const activeFilter = useMemo(() => {
        const group = getGroupSlug(searchParams.get('group')) || 'category';
        const tag = searchParams.get('tag')?.toLowerCase() || 'all';
        return `${group}:${tag}`;
    }, [searchParams]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    useEffect(() => {
        const savedView = localStorage.getItem('view');
        if (savedView) setViewMode(savedView);
    }, []);
    const [sortBy, setSortBy] = useState('none');
    const [noPassOnly, setNoPassOnly] = useState(false);
    
    // Modal & Security
    const [modalType, setModalType] = useState<'delete' | 'private' | null>(null);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [password, setPassword] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [activatingId, setActivatingId] = useState<string | null>(null);
    
    // --- 2. Effects ---
    useEffect(() => {
        const initDashboard = async () => {
            setIsLoading(true);
            const [session, { data, error: catalogError }, { data: creators }] = await Promise.all([
                getCurrentCreator(),
                supabase
                .rpc('template_catalog')
                    .overrideTypes<DashboardTemplate[], { merge: false }>(),
                supabase
                    .from('creators')
                    .select('user_id, display_name')
                    .eq('is_active', true)
            ]);
            setCreatorSession(session);
            if (catalogError) toast.error('Unable to load templates. Please retry.', {
                duration: Infinity, action: { label: 'Retry', onClick: () => window.location.reload() },
            });

            if (Array.isArray(data)) setTemplates(data.filter(item => item.is_active === true || canManageTemplate(session, item.user_id)).map(item => ({
                ...item,
                template_tags: visibleTemplateTags(item.template_tags),
            })));
            if (creators) {
                setCreatorNames(creators.reduce((acc: Record<string, string>, creator: any) => {
                    acc[creator.user_id] = creator.display_name;
                    return acc;
                }, {}));
            }
            setIsLoading(false);
        };

        initDashboard();

        const handleResize = () => {
            setIsOpen(window.innerWidth >= 1024);
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- UI ---
    const getPageTitle = () => {
        const parts = activeFilter.split(':');
        if (parts[1] == 'all') {
            return `${parts[1]} ${parts[0]}`;
        } else {
            return `${parts[1].replace(/-/g, ' ').toUpperCase()}`;
        }
    };

    const filteredTemplates = useMemo(() => {
        const result = templates.filter((item) => {
            if (noPassOnly && item.is_personal) return false;
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
            const [group, tagSlug] = activeFilter.split(':'); 
            
            if (tagSlug === 'all') {
                if (group !== 'category') {
                    return matchesSearch && item.template_tags?.some((t: any) => 
                        getGroupSlug(t.tags.tag_groups.name) === group
                    );
                }
                return matchesSearch;
            }

            const matchesFilter = item.template_tags?.some((t: any) => {
                const currentTagSlug = t.tags.slug.toLowerCase();
                const currentGroup = getGroupSlug(t.tags.tag_groups.name);
                return currentGroup === group && currentTagSlug === tagSlug;
            });
            
            return matchesSearch && matchesFilter;
        });

        const sortedResult = [...result];

        switch (sortBy) {
            case 'newest':
                sortedResult.sort((a, b) => b.id - a.id);
                break;
            case 'oldest':
                sortedResult.sort((a, b) => a.id - b.id);
                break;
            case 'az':
                sortedResult.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'za':
                sortedResult.sort((a, b) => b.title.localeCompare(a.title));
                break;
            default:
                break;
        }

        return sortedResult;
    }, [templates, searchQuery, activeFilter, sortBy, noPassOnly]);

    // --- 4. Event Handlers ---

    const handleTagClick = (groupName: string, tagSlug: string) => {
        router.push(`/?group=${getGroupSlug(groupName)}&tag=${tagSlug.toLowerCase()}`);
    };

    const closeModal = () => {
        if (isDeleting) return;
        setModalType(null);
        setSelectedItem(null);
        setPassword('');
    };

    const verifyTemplateAccess = async (id: string, credential: { password: string } | { fingerprint: string }) => {
        const { data: { session } } = await supabase.auth.getSession();
        const result = await fetch('/api/templates/unlock', {
            method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30_000),
            headers: { 'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({ templateId: id, ...credential }),
        });
        if (result.status === 403) return false;
        if (!result.ok) throw new Error(result.status === 429
            ? 'Too many unlock attempts. Please try again later.'
            : 'Unable to verify access. Please try again.');
        return true;
    };

    const handleOpenPrivate = async (item: any) => {
        const remembered = await getRememberedTemplateUnlock(String(item.id));
        let unlocked = false;
        try {
            if (remembered) unlocked = await verifyTemplateAccess(String(item.id), { fingerprint: remembered });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to verify access.');
            return;
        }
        if (unlocked) {
            const query = new URLSearchParams(templateRoute(item.template_tags, activeFilter));
            router.push(`/editor/${item.id}?${query}`);
            return;
        }
        setSelectedItem(item);
        setPassword('');
        setModalType('private');
    };

    const handleUnlockPrivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        const toastId = toast.loading("SYSTEM: Verifying_Access_Key...");

        const routeQuery = new URLSearchParams(templateRoute(selectedItem.template_tags, activeFilter)).toString();
        
        try {
            if (await verifyTemplateAccess(String(selectedItem.id), { password })) {
                const persisted = await rememberTemplateUnlock(String(selectedItem.id), password);

                toast.success(`ACCESS_GRANTED: DECRYPT_SUCCESS`, { id: toastId });
                if (!persisted) toast.info('เปิดเทมเพลตได้แล้ว แต่เบราว์เซอร์ไม่สามารถจำการปลดล็อกไว้ถาวรได้');
                closeModal();
                setTimeout(() => {
                    router.push(`/editor/${selectedItem.id}?${routeQuery}`);
                }, 800);
            } else {
                toast.error(`ACCESS_DENIED: INVALID_SECRET_KEY`, { id: toastId });
                setPassword('');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to verify access.', { id: toastId });
        }
    };

    const handleDelete = async () => {
        if (!selectedItem || isDeleting) return;
        const item = selectedItem;
        const toastId = toast.loading("SYSTEM: De-activating_Module...");
        setIsDeleting(true);
        try {
            const session = await getCurrentCreator();
            setCreatorSession(session);
            if (!canManageTemplate(session, item.user_id)) {
                throw new Error('คุณไม่มีสิทธิ์ลบเทมเพลตนี้ หรือเซสชันหมดอายุแล้ว');
            }
            await deactivateTemplate(supabase, item.id);
            toast.success(`MODULE_${item.id}_DEACTIVATED`, { id: toastId });
            setTemplates(prev => prev.map(t => t.id === item.id ? { ...t, is_active: false } : t));
            setModalType(null);
            setSelectedItem(null);
            setPassword('');
        } catch (err: any) {
            toast.error(`DELETE_ERROR: ${err.message || 'ลบเทมเพลตไม่สำเร็จ'}`, { id: toastId });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleActivate = async (item: any) => {
        if (activatingId) return;
        setActivatingId(String(item.id));
        const toastId = toast.loading('กำลังเปิดใช้งานเทมเพลต...');
        try {
            const session = await getCurrentCreator();
            setCreatorSession(session);
            if (!canManageTemplate(session, item.user_id)) throw new Error('คุณไม่มีสิทธิ์แก้ไขเทมเพลตนี้');
            await setTemplateActive(supabase, item.id, true);
            setTemplates(prev => prev.map(t => t.id === item.id ? { ...t, is_active: true } : t));
            toast.success('เปิดใช้งานเทมเพลตแล้ว', { id: toastId });
        } catch (error: any) {
            toast.error(error.message || 'เปิดใช้งานไม่สำเร็จ', { id: toastId });
        } finally {
            setActivatingId(null);
        }
    };

    return (
        <main className="grid main-grid-layout main-grid-area relative h-full overflow-hidden">
            <SideNav isOpen={isOpen} setIsOpen={setIsOpen} activeFilter={activeFilter} />
            
            <section className="section-grid-area flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1">
                    {!isOpen && (
                        <button onClick={() => setIsOpen(true)} className="absolute top-6 left-0 z-20 py-2 pr-1 border border-l-0 border-(--primary) bg-(--background) text-(--primary) text-xs leading-none hover:bg-(--primary) hover:text-black transition-all cursor-pointer">
                            <span>►</span>
                        </button>
                    )}
                    <Breadcrumbs path={activeFilter} />
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 py-4 max-lg:py-2 border-b border-(--primary)">
                        {/* Title */}
                        <h1 className="text-3xl md:text-5xl font-Monomaniac-One text-(--primary) uppercase leading-none">
                            {getPageTitle()}
                        </h1>
                        {/* Filters & Tools */}
                        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase">
                            {/* Search */}
                            <div className="relative flex-1 md:flex-none" suppressHydrationWarning>
                                <input 
                                    type="text" 
                                    placeholder="SEARCH..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border border-(--primary)/30 p-1 pl-2 pr-8 focus:border-(--primary) outline-none w-full md:w-40 transition-all placeholder:text-(--foreground)/30"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-(--primary)/50 pointer-events-none">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                </div>
                            </div>
                            {/* View Mode Icons */}
                            <div className="flex items-center border border-(--primary)/30 h-[26px]" suppressHydrationWarning>
                                <button 
                                    title="Grid View"
                                    onClick={() => setViewMode('grid')}
                                    className={`px-2 h-full flex items-center justify-center cursor-pointer transition-colors ${viewMode === 'grid' ? 'bg-(--primary) text-black' : 'text-(--primary) hover:bg-(--primary) hover:text-black'}`}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                </button>
                                <button 
                                    title="Line View"
                                    onClick={() => setViewMode('line')}
                                    className={`px-2 h-full flex items-center justify-center cursor-pointer transition-colors border-l border-(--primary)/30 ${viewMode === 'line' ? 'bg-(--primary) text-black' : 'text-(--primary) hover:bg-(--primary) hover:text-black'}`}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                                </button>
                            </div>
                            <TemplateSortFilter sortBy={sortBy} onSortChange={setSortBy}
                                noPassOnly={noPassOnly} onNoPassChange={setNoPassOnly} />
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    {!isLoading && filteredTemplates.length === 0 ? (
                        <div className="min-h-full flex items-center justify-center font-Google-Code uppercase select-none">
                            <div className="flex flex-col items-center gap-4">
                                <h2 className="text-2xl md:text-5xl text-(--primary)">
                                    404
                                </h2>
                                <p className="text-[10px] md:text-xs tracking-[0.2em] text-(--foreground)/50">
                                    No_Templates_Located_In_This_Sector
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div aria-busy={isLoading} className={`
                            ${viewMode === 'grid' 
                                ? 'grid gap-2 zzzcode-card-grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))]' 
                                : 'grid gap-2 md:gap-4 zzzcode-list-grid grid-cols-1'}
                        `}>
                            {isLoading ? (
                                <><span role="status" className="sr-only">Loading_Templates...</span>{Array.from({ length: 12 }).map((_, i) => (
                                    <SkeletonCard key={i} />
                                ))}</>
                            ) : (
                                filteredTemplates.map(item => (
                                    <TemplateCard 
                                        key={item.id} 
                                        item={item}
                                        activeFilter={activeFilter}
                                        viewMode={viewMode}
                                        canManage={canManageTemplate(creatorSession || {
                                            user: null,
                                            isCreator: false,
                                            isOwner: false
                                        }, item.user_id)}
                                        creatorName={creatorNames[item.user_id] || 'Unknown Creator'}
                                        onTagClick={handleTagClick} 
                                        onDelete={() => {
                                            setSelectedItem(item);
                                            setModalType('delete');
                                        }}
                                        onOpenPrivateModal={handleOpenPrivate}
                                        onActivate={() => handleActivate(item)}
                                        isActivating={activatingId === String(item.id)}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            </section>

            <Modal 
                isOpen={modalType !== null} 
                onClose={closeModal} 
                title={
                    modalType === 'delete' ? 'Confirm Deletion' : 'Authentication Required'
                }
            >
                {/* Delete Confirmation Modal */}
                {modalType === 'delete' && (
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
                                คุณแน่ใจหรือไม่ที่จะลบ <span className="text-red-400 font-bold">"{selectedItem?.title}"</span>?
                            </p>
                            <p className="text-[10px] text-white/40 uppercase leading-tight">
                                Warning: This will de-activate the template from the public dashboard. 
                                Internal ID_{selectedItem?.id.toString().padStart(3, '0')} will be archived.
                            </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button 
                                onClick={closeModal}
                                disabled={isDeleting}
                                className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                            >
                                Abort
                            </button>
                            <button 
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="cursor-pointer flex-1 py-2 bg-red-600 text-white font-bold uppercase text-xs hover:bg-red-500 transition-all disabled:opacity-50"
                            >
                                {isDeleting ? 'Processing...' : 'Confirm_Delete'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Private Code Access Modal */}
                {modalType === 'private' && (
                    <form onSubmit={handleUnlockPrivate} className="space-y-4">
                        <div className="flex items-center gap-2 text-(--primary) mb-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            <span className="text-xs uppercase font-bold tracking-widest">Security_Check</span>
                        </div>
                        
                        <p className="text-white/60 text-xs leading-relaxed">
                            เทมเพลต <span className="text-(--primary)">"{selectedItem?.title}"</span> ถูกล็อกไว้ <br/>
                            กรุณาระบุรหัสผ่านเพื่อเข้าถึง Source Code
                        </p>

                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="ENTER_SECRET_KEY..."
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75"
                            autoFocus
                        />

                        <div className="flex gap-2">
                            <button 
                                type="button"
                                onClick={closeModal} 
                                className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                            >
                                Abort
                            </button>
                            <button 
                                type="submit"
                                className="cursor-pointer flex-1 py-2 bg-(--primary) text-black font-bold uppercase text-xs hover:brightness-110 disabled:opacity-50"
                            >
                                Unlock_Access
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </main>
    );
}
