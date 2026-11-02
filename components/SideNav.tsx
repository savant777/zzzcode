"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dashboardRequest } from '@/lib/dashboard-cache';
import { useDashboardCacheVersion } from '@/lib/use-dashboard-cache';
import SkeletonNav from '@/components/SkeletonNav';
import { getGroupSlug, compareTagOrder, TAG_GROUP_ORDER as GROUP_ORDER } from '@/lib/routes';
import { binHeaders } from '@/lib/bin-client';
import { dashboardTagUrl, HOGTHAI_GROUPS } from '@/lib/dashboard';

export default function SideNav({ isOpen, setIsOpen, activeFilter, hogthai = false, bin = false }: any) {
    const [binUnlocked, setBinUnlocked] = useState(false);
    useEffect(() => {
        const sync = () => setBinUnlocked(!!binHeaders()['X-Bin-Token']);
        sync();
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, [bin, activeFilter]);
    const [isLoading, setIsLoading] = useState(true);
    const [menuData, setMenuData] = useState<any[]>([]);
    const activeGroup = (getGroupSlug(activeFilter?.split(':')[0]) || 'category').toUpperCase();
    const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroup);
    
    const router = useRouter();
    const cacheVersion = useDashboardCacheVersion();

    useEffect(() => {
        setExpandedGroup(activeGroup);
    }, [activeFilter, activeGroup]);

    useEffect(() => {
        let disposed = false;
        const fetchMenu = async () => {
            setIsLoading(true);
            const [{ data: groups, error: groupsError }, { data: tags, error: tagsError }] = await Promise.all([
                dashboardRequest('menu-groups', () => supabase
                .from('tag_groups')
                    .select('id, name')
                    .order('id', { ascending: true })),
                dashboardRequest('menu-tags', () => supabase
                    .from('tags')
                    .select('id, group_id, name, slug, is_active')
                    .eq('is_active', true)
                    .order('id', { ascending: true }))
            ]);
            if (disposed) return;

            if (groupsError || tagsError) {
                console.error('SideNav menu load error:', groupsError || tagsError);
                setIsLoading(false);
                return;
            }

            if (groups && tags) {
                const tagsByGroup = tags.reduce((acc: Record<string, any[]>, tag: any) => {
                    const key = String(tag.group_id);
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(tag);
                    return acc;
                }, {});

                groups.forEach(group => {
                    tagsByGroup[String(group.id)]?.sort((a, b) => compareTagOrder(group.name, a, b));
                });

                const activeGroups = groups
                    .map(group => ({
                        ...group,
                        tags: tagsByGroup[String(group.id)] || []
                    }))
                    .filter(group => group.tags.length > 0)
                    .sort((a, b) => {
                        const orderA = GROUP_ORDER.indexOf(getGroupSlug(a.name));
                        const orderB = GROUP_ORDER.indexOf(getGroupSlug(b.name));
                        const safeOrderA = orderA === -1 ? GROUP_ORDER.length : orderA;
                        const safeOrderB = orderB === -1 ? GROUP_ORDER.length : orderB;

                        if (safeOrderA !== safeOrderB) return safeOrderA - safeOrderB;
                        return a.id - b.id;
                    });
                setMenuData(activeGroups);
            }
            setIsLoading(false);
        };
        fetchMenu();
        return () => { disposed = true; };
    }, [cacheVersion]);

    const handleFilterChange = (groupName: string, tagSlug: string) => {
        router.push(bin ? (hogthai ? '/hogthai/bin?' : '/bin?') + new URLSearchParams({ group: getGroupSlug(groupName), tag: tagSlug }) : dashboardTagUrl(groupName, tagSlug, hogthai));
        
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
                <Link href={hogthai ? '/?group=category&tag=all' : '/hogthai'}
                    onClick={() => { if (window.innerWidth < 1024) setIsOpen(false); }}
                    className="w-full p-2 px-3 border-b border-(--primary)/20 text-(--primary) hover:bg-(--primary)/5 font-black tracking-widest flex justify-between items-center bg-(--background) cursor-pointer uppercase">
                    <span>{hogthai ? 'roleplayth' : 'hogthai'}</span>
                    <span aria-hidden="true">→</span>
                </Link>
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <SkeletonNav key={i} />
                    ))
                ) : (
                    menuData.filter(group => !hogthai || HOGTHAI_GROUPS.includes(getGroupSlug(group.name))).map((group) => (
                        <NavGroup 
                            key={group.id}
                            title={group.name} 
                            tags={group.tags.filter((tag: any) => !(getGroupSlug(group.name) === 'style' && tag.slug.toLowerCase() === 'hogthai'))}
                            activeFilter={activeFilter}
                            onSelect={(tagSlug: string) => handleFilterChange(group.name, tagSlug)} 
                            isExpanded={expandedGroup === getGroupSlug(group.name).toUpperCase()}
                            onToggle={() => {
                                const groupKey = getGroupSlug(group.name).toUpperCase();
                                setExpandedGroup(expandedGroup === groupKey ? null : groupKey);
                            }}
                        />
                    ))
                )}
            </div>
            <Link href={bin ? (hogthai ? '/hogthai' : '/') : (hogthai ? '/hogthai/bin' : '/bin')} onClick={() => { if (window.innerWidth < 1024) setIsOpen(false); }}
                className="mt-auto w-full p-2 px-3 border-t border-b border-(--primary)/20 text-(--primary) hover:bg-(--primary)/5 font-black tracking-widest flex justify-between items-center bg-(--background) cursor-pointer uppercase">
                <span>{bin ? '.exit' : '.bin'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="16" width="16" fill="currentColor" aria-label={binUnlocked ? 'Unlocked' : 'Locked'} className="shrink-0">
                    <path d={binUnlocked ? 'M6,20H18V10H6V20Zm7.41-3.59Q14,15.83 14,15t-0.59-1.41T12,13t-1.41,0.59Q10,14.18 10,15t0.59,1.41T12,17t1.41-0.59ZM6,20V10V20Zm0,2q-0.82,0-1.41-0.59T4,20V10Q4,9.17 4.59,8.59T6,8h7V6q0-2.08 1.46-3.54T18,1t3.54,1.46T23,6H21q0-1.25-0.88-2.13T18,3T15.88,3.88T15,6V8h3q0.82,0 1.41,0.59T20,10V20q0,0.82-0.59,1.41T18,22H6Z' : 'M6,22q-0.82,0-1.41-0.59T4,20V10Q4,9.17 4.59,8.59T6,8H7V6Q7,3.92 8.46,2.46T12,1t3.54,1.46T17,6V8h1q0.82,0 1.41,0.59T20,10V20q0,0.82-0.59,1.41T18,22H6Zm0-2H18V10H6V20Zm7.41-3.59Q14,15.83 14,15t-0.59-1.41T12,13t-1.41,0.59Q10,14.18 10,15t0.59,1.41T12,17t1.41-0.59ZM9,8h6V6q0-1.25-0.88-2.13T12,3T9.88,3.88T9,6V8ZM6,20V10V20Z'} />
                </svg>
            </Link>
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

                            const currentKey = `${getGroupSlug(title)}:${tag.slug.toLowerCase()}`;
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
