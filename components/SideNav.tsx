"use client";
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase';
import SkeletonNav from '@/components/SkeletonNav';

export default function SideNav({ isOpen, setIsOpen, activeFilter }: any) {
    const [isLoading, setIsLoading] = useState(true);
    const [menuData, setMenuData] = useState<any[]>([]);
    const [expandedGroup, setExpandedGroup] = useState<string | null>('CATEGORY');
    
    const router = useRouter();

    useEffect(() => {
        const fetchMenu = async () => {
            setIsLoading(true);
            const { data } = await supabase
                .from('tag_groups')
                .select(`id, name, tags (name, slug, is_active)`)
                .eq('tags.is_active', true)
                .order('id', { ascending: true });

            if (data) {
                const activeGroups = data.filter(group => group.tags.length > 0);
                setMenuData(activeGroups);
            }
            setIsLoading(false);
        };
        fetchMenu();
    }, []);

    const handleFilterChange = (groupName: string, tagSlug: string) => {
        router.push(`/?group=${groupName.toLowerCase()}&tag=${tagSlug.toLowerCase()}`);
        
        if (window.innerWidth < 1024) {
            setIsOpen(false);
        }
    };

    return (
        <nav className={`
            nav-grid-area border-r border-(--primary) bg-(--background) transition-all duration-300 font-Google-Code flex flex-col h-full overflow-hidden
            ${isOpen ? 'w-64' : 'w-0 border-r-0'}
            max-lg:fixed max-lg:w-full max-lg:border-r-0 max-lg:left-0 max-lg:z-50 max-lg:h-[calc(100vh-var(--header-height)-var(--footer-height))]
            ${!isOpen && 'max-lg:-translate-x-full'}
        `}>
            <button 
                onClick={() => setIsOpen(false)} 
                className="w-full p-4 text-left text-(--primary) border-b border-(--primary)/20 hover:bg-(--primary)/10 transition-colors font-bold flex justify-between items-center cursor-pointer uppercase"
            >
                <span>close</span>
                <span>✕</span>
            </button>

            <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <SkeletonNav key={i} />
                    ))
                ) : (
                    menuData.map((group) => (
                        <NavGroup 
                            key={group.id}
                            title={group.name} 
                            tags={group.tags} 
                            activeFilter={activeFilter}
                            onSelect={(tagSlug: string) => handleFilterChange(group.name, tagSlug)} 
                            isExpanded={expandedGroup === group.name.toUpperCase()}
                            onToggle={() => setExpandedGroup(expandedGroup === group.name.toUpperCase() ? null : group.name.toUpperCase())}
                        />
                    ))
                )}
            </div>
        </nav>
    );
}

function NavGroup({ title, tags, activeFilter, onSelect, isExpanded, onToggle }: any) {
    const items = [{ name: 'all', slug: 'all' }, ...tags, { name: '', slug: 'blank' }];
    
    return (
        <div className="flex flex-col border-b border-(--primary)/20">
            <button 
                onClick={onToggle}
                className="w-full p-2 px-3 text-(--primary) hover:bg-(--primary)/5 font-black tracking-widest flex justify-between items-center bg-(--background) cursor-pointer uppercase"
            >
                <span>{title}</span>
                <span>{isExpanded ? '-' : '+'}</span>
            </button>

            <div className={`
                grid transition-[grid-template-rows] duration-300 ease-in-out
                ${isExpanded ? 'grid-template-rows-[1fr]' : 'grid-template-rows-[0fr]'}
            `}>
                <div className="overflow-hidden">
                    <div className="flex flex-col">
                        {items.map((tag: any) => {
                            if (tag.slug === 'blank') {
                                return (
                                    <div 
                                        key={tag.slug} 
                                        className="w-full p-2 text-sm border-t border-(--primary)/20 bg-(--background) select-none"
                                    >
                                        &nbsp;
                                    </div>
                                );
                            }

                            const currentKey = `${title.toLowerCase()}:${tag.slug.toLowerCase()}`;
                            const isActive = activeFilter === currentKey;

                            return (
                                <button 
                                    key={tag.slug}
                                    onClick={() => onSelect(tag.slug)}
                                    className={`
                                        w-full p-2 pl-3 pr-6 text-sm border-t border-(--primary)/20 transition-all flex items-center gap-2 cursor-pointer uppercase
                                        ${isActive 
                                            ? 'text-(--primary) bg-(--primary)/10 font-bold' 
                                            : 'text-(--foreground)/75 hover:text-(--primary) hover:bg-(--primary)/5'}
                                    `}
                                >
                                    <div className="w-2 flex justify-center">
                                        {isActive ? <span className="text-(--primary)">•</span> : null}
                                    </div>
                                    <span>{tag.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}