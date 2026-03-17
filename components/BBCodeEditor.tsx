"use client";
import { useRef, useState, useEffect } from 'react';
import { HexColorPicker } from "react-colorful";

interface Props {
    value: string;
    onChange: (val: string) => void;
}

export default function BBCodeEditor({ value, onChange }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertTag = (open: string, close: string, forcedContent?: string) => {
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
            const lines = (forcedContent ?? selectedText).split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            if (lines.length > 0) {
                const listBody = lines.map(l => `[*]${l}`).join('\n');
                replacement = `${open}\n${listBody}\n${close}`;
            } else {
                replacement = `${open}\n[*]\n${close}`;
            }
        } 

        else if (forcedContent !== undefined) {
            replacement = `${open}${forcedContent}${close}`;
        }

        else {
            replacement = `${open}${selectedText}${close}`;
        }

        const newValue = beforeText + replacement + afterText;
        onChange(newValue);

        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + replacement.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
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

    // Color Picker
    const [currentColor, setCurrentColor] = useState("#000000");
    const [showColorPicker, setShowColorPicker] = useState(false);

    const applyColor = () => {
        insertTag(`[color=${currentColor}]`, "[/color]");
        setShowColorPicker(false);
    };

    // Insert Image
    const [imgData, setImgData] = useState({ url: '', w: '', h: '' });
    const [showImgOption, setShowImgOption] = useState(false);

    const applyImage = () => {
        if (!imgData.url) return;
        let tag = '[img]';
        if (imgData.w && imgData.h) {
            tag = `[img=${imgData.w}x${imgData.h}]`;
        }
        insertTag(tag + imgData.url, '[/img]');
        setShowImgOption(false);
        setImgData({ url: '', w: '', h: '' });
    };

    // Insert Url
    const [showUrlOption, setShowUrlOption] = useState(false);
    const [urlData, setUrlData] = useState({ url: '', text: '' });
    
    const applyUrl = () => {
        if (!urlData.url) return;

        const textarea = textareaRef.current;
        const start = textarea?.selectionStart || 0;
        const end = textarea?.selectionEnd || 0;
        
        const selectedText = value.substring(start, end);

        const link = urlData.url.startsWith('http') || urlData.url.startsWith('#') 
            ? urlData.url 
            : `http://${urlData.url}`;

        const displayTagText = urlData.text.trim() || selectedText;
        
        insertTag(`[url=${link}]`, `[/url]`, displayTagText);

        setShowUrlOption(false);
        setUrlData({ url: '', text: '' });
    };

    return (
        <div className="font-Google-Sans bg-black/40 border border-(--primary)/40 text-sm outline-none focus:border-(--primary) transition-all overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap border-b border-(--primary)/40 p-2 gap-2">
                {/* กลุ่มสไตล์ */}
                <div className="flex p-0.5 gap-0.5 border border-(--primary)/25 bg-(--primary)/5">
                    <button title="ตัวหนา" onClick={() => insertTag('[b]', '[/b]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M272-200v-560h221q65 0 120 40t55 111q0 51-23 78.5T602-491q25 11 55.5 41t30.5 90q0 89-65 124.5T501-200H272Zm121-112h104q48 0 58.5-24.5T566-372q0-11-10.5-35.5T494-432H393v120Zm0-228h93q33 0 48-17t15-38q0-24-17-39t-44-15h-95v109Z"/>
                        </svg>
                    </button>
                    <button title="ตัวเอียง" onClick={() => insertTag('[i]', '[/i]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M200-200v-100h160l120-360H320v-100h400v100H580L460-300h140v100H200Z"/>
                        </svg>
                    </button>
                    <button title="ขีดเส้นใต้" onClick={() => insertTag('[u]', '[/u]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M200-120v-80h560v80H200Zm123-223q-56-63-56-167v-330h103v336q0 56 28 91t82 35q54 0 82-35t28-91v-336h103v330q0 104-56 167t-157 63q-101 0-157-63Z"/>
                        </svg>
                    </button>
                    <button title="ขีดทับ" onClick={() => insertTag('[s]', '[/s]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M486-160q-76 0-135-45t-85-123l88-38q14 48 48.5 79t85.5 31q42 0 76-20t34-64q0-18-7-33t-19-27h112q5 14 7.5 28.5T694-340q0 86-61.5 133T486-160ZM80-480v-80h800v80H80Zm402-326q66 0 115.5 32.5T674-674l-88 39q-9-29-33.5-52T484-710q-41 0-68 18.5T386-640h-96q2-69 54.5-117.5T482-806Z"/>
                        </svg>
                    </button>
                </div>

                {/* กลุ่มจัดแนว */}
                <div className="flex p-0.5 gap-0.5 border border-(--primary)/25 bg-(--primary)/5">
                    <button title="ชิดซ้าย" onClick={() => insertTag('[align=left]', '[/align]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M120-120v-80h720v80H120Zm0-160v-80h480v80H120Zm0-160v-80h720v80H120Zm0-160v-80h480v80H120Zm0-160v-80h720v80H120Z"/>
                        </svg>
                    </button>
                    <button title="ตรงกลาง" onClick={() => insertTag('[align=center]', '[/align]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M120-120v-80h720v80H120Zm160-160v-80h400v80H280ZM120-440v-80h720v80H120Zm160-160v-80h400v80H280ZM120-760v-80h720v80H120Z"/>
                        </svg>
                    </button>
                    <button title="ชิดขวา" onClick={() => insertTag('[align=right]', '[/align]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M120-760v-80h720v80H120Zm240 160v-80h480v80H360ZM120-440v-80h720v80H120Zm240 160v-80h480v80H360ZM120-120v-80h720v80H120Z"/>
                        </svg>
                    </button>
                    <button title="จัดบรรทัดให้เสมอกัน" onClick={() => insertTag('[align=justify]', '[/align]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M120-120v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Z"/>
                        </svg>
                    </button>
                </div>

                {/* กลุ่มตกแต่ง */}
                <div className="flex p-0.5 gap-0.5 border border-(--primary)/25 bg-(--primary)/5">
                    <div className="relative">
                        <button title="สีตัวอักษร" onClick={() => setShowColorPicker(!showColorPicker)} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                                <path d="M96 0v-192h768V0H96Zm161-336 180-480h86l180 480h-83l-43-123H384l-44 123h-83Zm151-192h144l-70-194h-4l-70 194Z"/>
                            </svg>
                        </button>
                        {showColorPicker && (
                            <div className="absolute top-full translate-y-[2px] -left-[3px] z-10 border border-(--primary)/25 bg-black p-3 flex flex-col gap-2 w-48">
                                <div className="text-xs text-(--foreground)/50 uppercase">เลือกสี (HEX/RGB)</div>
                                <div className="custom-color-picker">
                                    <HexColorPicker 
                                        color={currentColor.startsWith('#') ? currentColor : '#FFFFFF'} 
                                        onChange={(newColor) => setCurrentColor(newColor.toUpperCase())} 
                                    />
                                </div>
                                <input 
                                    type="text" 
                                    value={currentColor}
                                    onChange={(e) => setCurrentColor(e.target.value)}
                                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"
                                    placeholder="#FFFFFF"
                                />
                                <button 
                                    onClick={applyColor}
                                    className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    use
                                </button>
                            </div>
                        )}
                    </div>
                    <button title="ลบการจัดรูปแบบ" onClick={() => onChange(value.replace(/\[\/?.*?\]/g, ''))} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M768-90 576-282l-89 90H235L117-310q-21-22-21-51.5t21-50.5l165-164L90-768l51-51 678 678-51 51ZM265-264h192l69-69-193-193-165 165 97 97Zm413-120-51-50 165-165-193-193-165 165-50-51 164-165q22-20 52-20.5t50 20.5l193 193q21 22 21.5 52T843-548L678-384ZM530-530ZM430-428Z"/>
                        </svg>
                    </button>
                </div>

                {/* กลุ่มแทรกวัตถุ */}
                <div className="flex p-0.5 gap-0.5 border border-(--primary)/25 bg-(--primary)/5">
                    <button title="แทรกบรรทัดแนวนอน" onClick={() => insertTag('[hr]','')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M192-444v-72h576v72H192Z"/>
                        </svg>
                    </button>
                    <div className="relative">
                        <button title="แทรกรูปภาพ" onClick={() => setShowImgOption(!showImgOption)} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                                <path d="M216-144q-29.7 0-50.85-21.5Q144-187 144-216v-528q0-29 21.15-50.5T216-816h528q29.7 0 50.85 21.5Q816-773 816-744v528q0 29-21.15 50.5T744-144H216Zm0-72h528v-528H216v528Zm48-72h432L552-480 444-336l-72-96-108 144Zm-48 72v-528 528Z"/>
                            </svg>
                        </button>
                        {showImgOption && (
                            <div className="absolute top-full translate-y-[2px] -left-[3px] z-10 border border-(--primary)/25 bg-black p-3 flex flex-col gap-2 w-48">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <label className="text-xs text-(--foreground)/50 uppercase">แทรกรูปภาพ</label>
                                    <input type="text" placeholder="URL รูปภาพ" value={imgData.url} onChange={e => setImgData({...imgData, url: e.target.value})} className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"/>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <label className="text-xs text-(--foreground)/50 uppercase">W <span className="text-[9px] normal-case">(Optional)</span></label>
                                        <input type="text" placeholder="Width" value={imgData.w} onChange={e => setImgData({...imgData, w: e.target.value})} className="flex-1 min-w-0 font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"/>
                                    </div>
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <label className="text-xs text-(--foreground)/50 uppercase">H <span className="text-[9px] normal-case">(Optional)</span></label>
                                        <input type="text" placeholder="Height" value={imgData.h} onChange={e => setImgData({...imgData, h: e.target.value})} className="flex-1 min-w-0 font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"/>
                                    </div>
                                </div>
                                <button 
                                    onClick={applyImage}
                                    className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    Insert
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="relative">
                        <button title="แทรกลิงก์" onClick={() => setShowUrlOption(!showUrlOption)} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                                <path d="M432-288H288q-79.68 0-135.84-56.23Q96-400.45 96-480.23 96-560 152.16-616q56.16-56 135.84-56h144v72H288q-50 0-85 35t-35 85q0 50 35 85t85 35h144v72Zm-96-156v-72h288v72H336Zm192 156v-72h144q50 0 85-35t35-85q0-50-35-85t-85-35H528v-72h144q79.68 0 135.84 56.23 56.16 56.22 56.16 136Q864-400 807.84-344 751.68-288 672-288H528Z"/>
                            </svg>
                        </button>
                        {showUrlOption && (
                            <div className="absolute top-full translate-y-[2px] -left-[3px] z-10 border border-(--primary)/25 bg-black p-3 flex flex-col gap-2 w-48">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <label className="text-xs text-(--foreground)/50 uppercase">แทรกลิงก์</label>
                                    <input type="text" placeholder="ลิงก์ URL" value={urlData.url} onChange={e => setUrlData({...urlData, url: e.target.value})} className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"/>
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <label className="text-xs text-(--foreground)/50 uppercase">ข้อความ <span className="text-[9px] normal-case">(Optional)</span></label>
                                    <input type="text" placeholder="ข้อความแสดง" value={urlData.text} onChange={e => setUrlData({...urlData, text: e.target.value})} className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"/>
                                </div>
                                <button 
                                    onClick={applyUrl}
                                    className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    Insert
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* กลุ่มรายการ */}
                <div className="flex p-0.5 gap-0.5 border border-(--primary)/25 bg-(--primary)/5">
                    <button title="รายการจุด" onClick={() => insertTag('[list]', '[/list]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M360-240v-72h456v72H360Zm0-204v-72h456v72H360Zm0-204v-72h456v72H360ZM215.79-204Q186-204 165-225.21t-21-51Q144-306 165.21-327t51-21Q246-348 267-326.79t21 51Q288-246 266.79-225t-51 21Zm0-204Q186-408 165-429.21t-21-51Q144-510 165.21-531t51-21Q246-552 267-530.79t21 51Q288-450 266.79-429t-51 21ZM165-633.21q-21-21.21-21-51T165.21-735q21.21-21 51-21T267-734.79q21 21.21 21 51T266.79-633q-21.21 21-51 21T165-633.21Z"/>
                        </svg>
                    </button>
                    <button title="รายการตัวเลข" onClick={() => insertTag('[list=1]', '[/list]')} className="flex-1 p-0.5 px-1 cursor-pointer hover:bg-(--primary)/15 transition-color duration-300 ease-in-out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M144-144v-48h96v-24h-48v-48h48v-24h-96v-48h120q10.2 0 17.1 6.9 6.9 6.9 6.9 17.1v48q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9 10.2 0 17.1 6.9 6.9 6.9 6.9 17.1v48q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9H144Zm0-240v-96q0-10.2 6.9-17.1 6.9-6.9 17.1-6.9h72v-24h-96v-48h120q10.2 0 17.1 6.9 6.9 6.9 6.9 17.1v72q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9h-72v24h96v48H144Zm48-240v-144h-48v-48h96v192h-48Zm168 384v-72h456v72H360Zm0-204v-72h456v72H360Zm0-204v-72h456v72H360Z"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <textarea
                ref={textareaRef}
                className="w-full p-3 h-64 focus:outline-none font-sans text-sm leading-relaxed"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="พิมพ์ข้อความที่นี่..."
            />
        </div>
    );
}