"use client";

import { useEffect, useRef, useState } from 'react';

const options = [
    ['none', 'NONE'], ['az', 'A → Z'], ['za', 'Z → A'],
    ['newest', 'NEWEST'], ['oldest', 'OLDEST'],
];

export default function TemplateSortFilter({ sortBy, onSortChange, noPassOnly, onNoPassChange }: {
    sortBy: string;
    onSortChange: (value: string) => void;
    noPassOnly: boolean;
    onNoPassChange: (value: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    return (
        <div ref={root} className="relative flex-none" onBlur={event => {
            // Clicking a label can blur the trigger before focusing its hidden input.
            // Keep the menu mounted for that click; outside pointers close it above.
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }} onKeyDown={event => {
            if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        }}>
            <button ref={trigger} type="button" aria-label="Sort and filter templates" aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className={`flex items-center gap-1.5 border h-[28px] px-2 cursor-pointer text-(--primary) hover:border-(--primary) ${noPassOnly ? 'border-(--primary) bg-(--primary)/10' : 'border-(--primary)/30'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {options.find(([value]) => value === sortBy)?.[1]}
                {noPassOnly && <span className="text-[10px]">· NO PASS</span>}
            </button>
            {open && <div className="absolute right-0 top-full z-30 min-w-full w-max border border-(--primary) bg-(--background) py-1 text-(--primary)">
                <fieldset aria-label="Sort order">
                    {options.map(([value, label]) => <label key={value} className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-(--primary)/10">
                        <input type="radio" name="template-sort" value={value} checked={sortBy === value}
                            onChange={() => onSortChange(value)} className="peer sr-only" />
                        <span aria-hidden="true" className="flex h-[1em] w-[1em] shrink-0 items-center justify-center peer-focus-visible:ring-1 peer-focus-visible:ring-(--primary)">
                            {sortBy === value && <span className="h-[0.45em] w-[0.45em] rounded-full bg-current" />}
                        </span>
                        {label}
                    </label>)}
                </fieldset>
                <hr className="my-1 border-(--primary)/30" />
                <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-(--primary)/10">
                    <input type="checkbox" checked={noPassOnly} onChange={event => onNoPassChange(event.target.checked)} className="peer sr-only" />
                    <span aria-hidden="true" className="flex h-[1em] w-[1em] shrink-0 items-center justify-center border border-(--primary)/60 bg-(--primary)/10 peer-focus-visible:ring-1 peer-focus-visible:ring-(--primary) peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-(--background)">
                        {noPassOnly && <span className="h-[0.5em] w-[0.5em] bg-current" />}
                    </span>
                    NO PASS
                </label>
            </div>}
        </div>
    );
}
