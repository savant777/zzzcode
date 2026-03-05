"use client";
import { useState } from 'react';
import Link from 'next/link';

export default function SideNav({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) {
    return (
        <nav className={`
            zzzcode-grid-area border-r border-(--primary)/20 bg-[#1a1a1a] overflow-y-auto transition-all duration-300
            ${isOpen ? 'w-64' : 'w-0'} 
            max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-64 
            ${!isOpen && 'max-lg:-translate-x-full'}
        `}>
            <div className="p-4 flex flex-col gap-6 min-w-64">
                <h2 className="font-Monomaniac-One text-2xl text-(--primary) border-b border-(--primary)/20 pb-2">MENU</h2>
                <div className="flex flex-col gap-2">
                    <NavGroup title="1. Category" items={['Profile', 'Shop', 'Coding']} />
                    <NavGroup title="2. Activity" items={['Daily Check', 'Projects', 'Events']} />
                    <NavGroup title="3. Commission" items={['Status', 'Queue', 'Prices']} />
                </div>
            </div>
        </nav>
    );
}

function NavGroup({ title, items }: { title: string; items: string[] }) {
    const [expanded, setExpanded] = useState(true);
    return (
        <div className="flex flex-col">
            <button onClick={() => setExpanded(!expanded)} className="flex justify-between py-2 px-3 hover:bg-(--primary)/10 text-sm font-bold">
                <span>{title}</span>
                <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {expanded && (
                <div className="flex flex-col ml-4 border-l border-(--primary)/10 my-1">
                    {items.map(item => (
                        <Link key={item} href="#" className="py-2 px-4 text-xs text-gray-400 hover:text-(--primary)">{item}</Link>
                    ))}
                </div>
            )}
        </div>
    );
}