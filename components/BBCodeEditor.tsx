"use client";
import { useRef, useState, useEffect } from 'react';

interface Props {
    value: string;
    onChange: (val: string) => void;
}

export default function BBCodeEditor({ value, onChange }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertTag = (open: string, close: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        const fullText = value;
        const selectedText = fullText.substring(start, end);
        const beforeText = fullText.substring(0, start);
        const afterText = fullText.substring(end);

        let replacement = "";

        if (open.includes('[list')) {
            const lines = selectedText.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            if (lines.length > 0) {
                const listBody = lines.map(l => `[*]${l}`).join('\n');
                replacement = `${open}\n${listBody}\n${close}`;
            } else {
                replacement = `${open}\n[*]\n${close}`;
            }
        } else {
            replacement = `${open}${selectedText}${close}`;
        }

        const newValue = beforeText + replacement + afterText;
        onChange(newValue);

        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + replacement.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
        console.log('insertTag called', { open, selectedText: textarea.value.substring(start, end) })
        console.log(JSON.stringify(selectedText))
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') { e.preventDefault(); insertTag('[b]', '[/b]'); }
            if (e.key === 'i') { e.preventDefault(); insertTag('[i]', '[/i]'); }
            if (e.key === 'u') { e.preventDefault(); insertTag('[u]', '[/u]'); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [value]);

    const [currentColor, setCurrentColor] = useState("#000000");
    const [showColorPicker, setShowColorPicker] = useState(false);

    const applyColor = () => {
        insertTag(`[color=${currentColor}]`, "[/color]");
        setShowColorPicker(false);
    };

    return (
        <div className="border rounded-md overflow-hidden bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap bg-gray-50 border-b p-1 gap-1">
                {/* กลุ่มสไตล์ */}
                <div className="flex border-r pr-1 gap-1">
                    <button title="ตัวหนา (Ctrl + B)" onClick={() => insertTag('[b]', '[/b]')} className="px-2 py-1 border bg-white rounded font-bold">B</button>
                    <button title="ตัวเอียง (Ctrl + I)" onClick={() => insertTag('[i]', '[/i]')} className="px-2 py-1 border bg-white rounded italic">I</button>
                    <button title="ขีดเส้นใต้ (Ctrl + U)" onClick={() => insertTag('[u]', '[/u]')} className="px-2 py-1 border bg-white rounded underline">U</button>
                    <button title="ขีดทับ" onClick={() => insertTag('[s]', '[/s]')} className="px-2 py-1 border bg-white rounded line-through">S</button>
                </div>

                {/* กลุ่มจัดแนว */}
                <div className="flex border-r pr-1 gap-1">
                    <button title="ชิดซ้าย" onClick={() => insertTag('[align=left]', '[/align]')} className="px-2 py-1 border bg-white rounded">Left</button>
                    <button title="ตรงกลาง" onClick={() => insertTag('[align=center]', '[/align]')} className="px-2 py-1 border bg-white rounded">Center</button>
                    <button title="ชิดขวา" onClick={() => insertTag('[align=right]', '[/align]')} className="px-2 py-1 border bg-white rounded">Right</button>
                    <button title="จัดบรรทัดให้เสมอกัน" onClick={() => insertTag('[align=justify]', '[/align]')} className="px-2 py-1 border bg-white rounded">Justify</button>
                </div>

                {/* กลุ่มตกแต่ง */}
                <div className="flex border-r pr-1 gap-1">
                    <div className="relative flex items-center gap-1 border-r pr-1">
                        <button 
                            title="สีตัวอักษร" 
                            onClick={() => setShowColorPicker(!showColorPicker)}
                            className="w-8 h-8 rounded border shadow-sm"
                            style={{ backgroundColor: currentColor }}
                        ></button>
                    
                        {showColorPicker && (
                            <div className="absolute top-10 left-0 z-10 bg-white border p-3 rounded-lg shadow-xl flex flex-col gap-2 w-48">
                                <div className="text-xs font-bold text-gray-500 uppercase">เลือกสี (HEX/RGB)</div>
                                <input 
                                    type="color" 
                                    value={currentColor}
                                    onChange={(e) => setCurrentColor(e.target.value)}
                                    className="w-full h-10 cursor-pointer"
                                />
                                <input 
                                    type="text" 
                                    value={currentColor}
                                    onChange={(e) => setCurrentColor(e.target.value)}
                                    className="border px-2 py-1 text-sm font-mono w-full uppercase"
                                    placeholder="#FFFFFF"
                                />
                                <button 
                                    onClick={applyColor}
                                    className="bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 font-bold"
                                >
                                    ตกลง (ใช้สีนี้)
                                </button>
                            </div>
                        )}
                    </div>
                    <button title="ลบการจัดรูปแบบ" onClick={() => onChange(value.replace(/\[\/?.*?\]/g, ''))} className="px-2 py-1 border bg-white rounded text-xs">ล้างรูปแบบ</button>
                </div>

                {/* กลุ่มรายการ */}
                <div className="flex gap-1">
                    <button title="รายการจุด" onClick={() => insertTag('[list]', '[/list]')} className="px-2 py-1 border bg-white rounded">UL</button>
                    <button title="รายการตัวเลข" onClick={() => insertTag('[list=1]', '[/list]')} className="px-2 py-1 border bg-white rounded">OL</button>
                </div>
            </div>
            
            <textarea
                ref={textareaRef}
                className="w-full p-3 h-64 focus:outline-none font-mono text-sm leading-relaxed"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="พิมพ์ข้อความที่นี่..."
            />
        </div>
    );
}