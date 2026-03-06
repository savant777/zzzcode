"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SideNav from '@/components/SideNav';
import Breadcrumbs from '@/components/Breadcrumbs';

export default function Home() {
    const [user, setUser] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [activeFilter, setActiveFilter] = useState('CATEGORY-ALL');
    const [isOpen, setIsOpen] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'line'>('grid');
    const [sortBy, setSortBy] = useState('none');
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = 12; // สมมติค่าไว้ก่อน

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        
        const fetchTemplates = async () => {
            let query = supabase.from('templates').select('*');
            
            if (!user) {
                query = query.eq('is_active', true);
            }
            
            const { data } = await query;
            if (data) setTemplates(data);
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
        return `${parts[1]} ${parts[0]}`;
    };

    return (
        <main className="grid zzzcode-grid-layout zzzcode-grid-area relative h-full overflow-hidden">
            <SideNav isOpen={isOpen} setIsOpen={setIsOpen} activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
            
            <section className="zzzcode-grid-area flex flex-col h-full overflow-hidden relative font-Google-Code">
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
                                    className={`px-2 h-full flex items-center justify-center cursor-pointer transition-colors ${viewMode === 'grid' ? 'bg-(--primary) text-black' : 'text-(--primary) hover:bg-(--primary)/10'}`}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                </button>
                                <button 
                                    title="Line View"
                                    onClick={() => setViewMode('line')}
                                    className={`px-2 h-full flex items-center justify-center cursor-pointer transition-colors border-l border-(--primary)/30 ${viewMode === 'line' ? 'bg-(--primary) text-black' : 'text-(--primary) hover:bg-(--primary)/10'}`}
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
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className={`
                        ${viewMode === 'grid' 
                            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
                            : 'flex flex-col border-t border-(--primary)/10'}
                    `}>
                        {templates.map(item => (
                            <div 
                                key={item.id} 
                                className={viewMode === 'line' 
                                    ? 'border-b border-(--primary)/10 py-3 px-2 flex justify-between items-center hover:bg-(--primary)/5 transition-colors group' 
                                    : 'border border-(--primary)/20 p-4 hover:border-(--primary)/50 transition-all bg-(--background)'}
                            >
                                <div className="flex items-center gap-4">
                                    {viewMode === 'line' && <span className="text-(--primary)/40 text-[10px]">ID_{item.id.toString().padStart(3, '0')}</span>}
                                    <span className="font-bold uppercase">{item.title}</span>
                                </div>
                                
                                {viewMode === 'line' && (
                                    <div className="flex gap-2">
                                        <button className="text-[10px] border border-(--primary)/30 px-2 py-1 hover:bg-(--primary) hover:text-black transition-colors">EDIT</button>
                                        <button className="text-[10px] border border-(--primary)/30 px-2 py-1 hover:bg-(--primary) hover:text-black transition-colors">VIEW</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}