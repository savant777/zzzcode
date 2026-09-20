"use client";
import { useState, useRef, useEffect } from 'react';
import ColorNameInput from './ColorNameInput';
import { createPortal } from 'react-dom';
import { RgbaColorPicker } from 'react-colorful';
import { parseColor, formatColor } from '@/lib/colors';
export default function ColorPicker({ color, onChange, modeTarget }: { color: string; onChange: (color: string) => void; modeTarget?: HTMLDivElement | null }) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'HEX' | 'RGB'>(/^rgb/i.test(color) ? 'RGB' : 'HEX');
    const ref = useRef<HTMLDivElement>(null); const parsed = parseColor(color);
    useEffect(() => { const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, []);
    function changeMode(next: 'HEX' | 'RGB') {
        setMode(next);
        if (parsed) onChange(formatColor(parsed, next));
    }
    const modeSelect = (<div className="relative h-4 w-14 shrink-0">
                <select
                    aria-label="รูปแบบสี"
                    value={mode}
                    onChange={e => changeMode(e.target.value as 'HEX' | 'RGB')}
                    className="block h-4 w-full appearance-none bg-transparent py-0 pl-0 pr-4 text-left text-[10px] leading-4 text-(--foreground)/60 outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-(--primary)/50"
                >
                    <option value="HEX" className="bg-(--background)">HEX</option>
                    <option value="RGB" className="bg-(--background)">RGB</option>
                </select>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 -960 960 960" width="12px" fill="currentColor" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-(--foreground)/60">
                    <path d="M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z" />
                </svg>
            </div>);
    return <div ref={ref} className={`relative flex flex-1 min-w-0 gap-2 ${modeTarget ? '' : 'pt-5'}`}>
        {modeTarget ? createPortal(modeSelect, modeTarget) : <div className="absolute right-0 top-0">{modeSelect}</div>}
        <button type="button" aria-label="เลือกสี" aria-expanded={open} onClick={() => setOpen(!open)} className="w-10 h-10 shrink-0 overflow-hidden p-0 border border-(--primary)/50" style={{ background: 'repeating-conic-gradient(#888 0% 25%, #ddd 0% 50%) 0 / 12px 12px', backgroundClip: 'padding-box' }}><span className="block w-full h-full" style={{ backgroundColor: parsed ? color : 'transparent' }} /></button>
        <div className="flex-1 min-w-0">
            <ColorNameInput
                floating
                label={'สี ' + mode + ' หรือชื่อสี'}
                inputClassName="font-Google-Sans block h-10 w-full min-w-0 bg-black/20 border border-(--primary)/50 p-2 text-sm outline-none focus:border-(--primary)/75 transition-all duration-300"
                value={color}
                onChange={onChange}
                onSelect={name => {
                    const selected = parseColor(name);
                    if (selected) onChange(formatColor(selected, mode));
                }}
                isValid={value => !!parseColor(value)}
                placeholder={mode === 'HEX' ? '#FFFFFF' : 'rgba(255, 255, 255, 1)'}
            />

        </div>
        {open && <div className="absolute top-12 left-0 z-50 p-3 bg-(--background) border border-(--primary)/50" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}><RgbaColorPicker color={parsed || { r: 255, g: 255, b: 255, a: 1 }} onChange={v => onChange(formatColor(v, mode))} /><div className="mt-2 text-xs">Opacity {Math.round((parsed?.a ?? 1) * 100)}%</div></div>}
    </div>;
}
