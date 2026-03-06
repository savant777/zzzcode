"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SideNav from '@/components/SideNav';
import Breadcrumbs from '@/components/Breadcrumbs';
import TemplateCard from '@/components/TemplateCard';
import SkeletonCard from '@/components/SkeletonCard';
import Modal from '@/components/Modal';

export default function Home() {
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [activeFilter, setActiveFilter] = useState('CATEGORY-ALL');
    const [isOpen, setIsOpen] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'line'>('grid');
    const [sortBy, setSortBy] = useState('none');

    const [modalType, setModalType] = useState<'delete' | 'private' | 'logout' | 'login' | null>(null);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const isAdmin = !!user;

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        
        const fetchTemplates = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('templates')
                .select(`
                    *,
                    template_tags (
                        tags (
                            name,
                            slug,
                            tag_groups (name)
                        )
                    )
                `)
                .eq('is_active', true)
                .order('id', { ascending: false });

            if (error) {
                console.error("Error fetching templates:", error.message);
                return;
            }
            if (data) setTemplates(data);
            setIsLoading(false);
        };

        fetchTemplates();

        const handleResize = () => {
            if (window.innerWidth < 1024) {
                setIsOpen(false);
            } else {
                setIsOpen(true);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getPageTitle = () => {
        const parts = activeFilter.split('-');
        if (parts[1] == 'ALL') {
            return `${parts[1]} ${parts[0]}`;
        } else {
            return `${parts[1]}`;
        }
    };
    
    const filteredTemplates = useMemo(() => {
        return templates.filter((item) => {
            const matchesSearch = 
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.id.toString().includes(searchQuery);

            const [filterGroup, filterValue] = activeFilter.split('-');

            if (filterValue === 'ALL') return matchesSearch;

            const matchesFilter = item.template_tags?.some((t: any) => {
                const tagName = t.tags.name.toUpperCase();
                const tagGroupName = t.tags.tag_groups.name.toUpperCase();

                if (filterGroup === 'TAG') {
                    return tagName === filterValue;
                } else {
                    return tagGroupName === filterGroup && tagName === filterValue;
                }
            });

            return matchesSearch && matchesFilter;
        });
    }, [templates, searchQuery, activeFilter]);

    const router = useRouter();
    const [password, setPassword] = useState('');

    const closeModal = () => {
        setModalType(null);
        setSelectedItem(null);
    };

    const handleUnlockPrivate = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password === selectedItem?.password) {
            closeModal();
            router.push(`/editor/${selectedItem.id}`);
        } else {
            alert("ACCESS_DENIED: INVALID_SECRET_KEY");
            setPassword('');
        }
    };

    const handleDelete = async () => {
        if (!selectedItem) return;
        
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('templates')
                .update({ is_active: false })
                .eq('id', selectedItem.id);

            if (error) {
                alert(`DELETE_ERROR: ${error.message}`);
            } else {
                setTemplates(prev => prev.filter(t => t.id !== selectedItem.id));
                closeModal();
            }
        } catch (err) {
            console.error("Unexpected error during deletion:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="grid main-grid-layout main-grid-area relative h-full overflow-hidden">
            <SideNav isOpen={isOpen} setIsOpen={setIsOpen} activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
            
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
                            <div className="relative flex-1 md:flex-none">
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
                            <div className="flex items-center border border-(--primary)/30 h-[26px]">
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
                            {/* Sort Filter */}
                            <div className="relative flex-none">
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-(--primary) pointer-events-none">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                                </div>
                                <select 
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="bg-transparent border border-(--primary)/30 h-[28px] pl-6 pr-2 outline-none cursor-pointer hover:border-(--primary) text-(--primary) w-full lg:w-auto appearance-none"
                                >
                                    <option value="none" className="bg-black">NONE</option>
                                    <option value="az" className="bg-black">A → Z</option>
                                    <option value="za" className="bg-black">Z → A</option>
                                    <option value="newest" className="bg-black">NEWEST</option>
                                    <option value="oldest" className="bg-black">OLDEST</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className={`
                        ${viewMode === 'grid' 
                            ? 'grid gap-2 zzzcode-card-grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))]' 
                            : 'grid gap-2 md:gap-4 zzzcode-list-grid grid-cols-1'}
                    `}>
                        {isLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))
                        ) : (
                            filteredTemplates.map(item => (
                                <TemplateCard 
                                    key={item.id} 
                                    item={item}
                                    viewMode={viewMode}
                                    isAdmin={isAdmin}
                                    setActiveFilter={setActiveFilter}
                                    onDelete={() => {
                                        setSelectedItem(item);
                                        setModalType('delete');
                                    }}
                                    onOpenPrivateModal={(selectedItem: any) => {
                                        setSelectedItem(selectedItem);
                                        setModalType('private');
                                    }}
                                />
                            ))
                        )}
                    </div>
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
                                onClick={() => setModalType(null)}
                                className="flex-1 py-2 border border-white/10 text-xs uppercase hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                Abort
                            </button>
                            <button 
                                onClick={handleDelete}
                                disabled={isLoading}
                                className="flex-1 py-2 bg-red-600 text-white font-black text-xs uppercase hover:bg-red-500 transition-all cursor-pointer shadow-[0_0_20px_rgba(220,38,38,0.2)] disabled:opacity-50"
                            >
                                {isLoading ? 'Processing...' : 'Confirm_Delete'}
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
                            className="w-full bg-black/40 border border-(--primary)/40 p-2 text-(--primary) outline-none focus:border-(--primary) placeholder:text-(--primary)/20 font-Google-Code"
                            autoFocus
                        />

                        <div className="flex gap-2">
                            <button 
                                type="button"
                                onClick={closeModal} 
                                className="flex-1 py-2 border border-(--primary)/20 text-xs uppercase hover:bg-(--primary)/5 cursor-pointer"
                            >
                                Abort
                            </button>
                            <button 
                                type="submit"
                                className="flex-2 py-2 bg-(--primary) text-black font-black text-xs uppercase hover:brightness-110 cursor-pointer shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]"
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