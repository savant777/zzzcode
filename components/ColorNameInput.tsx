"use client";
import { useState } from 'react';
import { colorNames, isBBCodeColor } from '@/lib/colors';
export default function ColorNameInput({ value, onChange, onSelect = onChange, inputClassName, placeholder = '#FFFFFF / red', label = 'HEX หรือชื่อสี', isValid = isBBCodeColor, floating = false }: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (value: string) => void;
    inputClassName?: string;
    placeholder?: string;
    label?: string;
    isValid?: (value: string) => boolean;
    floating?: boolean;
}) {
    const [focused, setFocused] = useState(false);
    const query = value.trim().toLowerCase();
    const matches = focused && /^[a-z]+$/.test(query) ? colorNames.filter(name => name.startsWith(query) && name !== query).slice(0, 5) : [];
    return <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}><input aria-label={label} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onKeyDown={e => { if (e.key === 'Escape') setFocused(false) }} aria-invalid={!!value && !isValid(value)} className={inputClassName || "w-full min-w-0 bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none"} placeholder={placeholder} />
        {matches.length > 0 && <div aria-label="ชื่อสีแนะนำ" className={`color-name-suggestions mt-1 max-h-32 overflow-y-auto overscroll-contain border border-(--primary)/30 ${floating ? "absolute top-full inset-x-0 z-40 bg-(--background)" : ""}`}>{matches.map(name => <button type="button" key={name} onPointerDown={e => e.preventDefault()} onClick={() => { onSelect(name); setFocused(false) }} className="flex items-center gap-1.5 w-full min-h-6 px-1.5 py-0.5 text-xs leading-5 text-left hover:bg-white/10"><span className="w-3 h-3 shrink-0 border border-white/30" style={{ backgroundColor: name }} />{name}</button>)}</div>}</div>;
}
