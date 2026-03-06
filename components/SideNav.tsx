"use client";
import { useState } from 'react';

const CATEGORY_ITEMS = ['all', 'roleplay', 'profile', 'sign', 'etc', 'BLANK'];
const ACTIVITY_ITEMS = ['all', 'activity name 1', 'activity name 2', 'BLANK'];
const COMMISSION_ITEMS = ['all', 'louisa', 'josephine', 'BLANK'];

export default function SideNav({ isOpen, setIsOpen, activeFilter, setActiveFilter }: any) {
    return (
        <nav className={`
            zzzcode-grid-area border-r border-(--primary) bg-(--background) transition-all duration-300 font-Google-Code flex flex-col h-full overflow-hidden
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
                <NavGroup 
                    title="category" 
                    items={CATEGORY_ITEMS} 
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                />
                <NavGroup 
                    title="activity" 
                    items={ACTIVITY_ITEMS} 
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                />
                <NavGroup 
                    title="commission" 
                    items={COMMISSION_ITEMS} 
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                />
            </div>
        </nav>
    );
}

function NavGroup({ title, items, activeFilter, setActiveFilter }: any) {
    const [expanded, setExpanded] = useState(true);
    
    return (
        <div className="flex flex-col border-b border-(--primary)/20">
            <button 
                onClick={() => setExpanded(!expanded)} 
                className="w-full p-2 px-3 text-(--primary) hover:bg-(--primary)/5 font-black tracking-widest flex justify-between items-center bg-(--background) cursor-pointer uppercase"
            >
                <span>{title}</span>
                <span>{expanded ? '-' : '+'}</span>
            </button>

            {expanded && (
                <div className="flex flex-col">
                    {items.map((item: string, index: number) => {
                        if (item === 'BLANK') {
                            return (
                                <div 
                                    key={`blank-${index}`} 
                                    className="w-full p-2 text-sm border-t border-(--primary)/20 bg-(--background) select-none"
                                >
                                    &nbsp;
                                </div>
                            );
                        }

                        const filterKey = `${title.toUpperCase()}-${item.toUpperCase()}`;
                        const isActive = activeFilter === filterKey;

                        return (
                            <button 
                                key={item} 
                                onClick={() => setActiveFilter(filterKey)}
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
                                <span>{item}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}