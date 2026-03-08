"use client";

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import BBCodeEditor from '@/components/BBCodeEditor';
import Breadcrumbs from '@/components/Breadcrumbs';
import { toast } from 'sonner';

export default function EditorPage() {
    const STORAGE_KEY = 'zzzcode_draft_editor_${templateId}';

    const { id } = useParams();
    const router = useRouter();
    const [template, setTemplate] = useState<any>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    // 1. Fetch Data
    useEffect(() => {
        const fetchTemplate = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) {
                toast.error("ERROR: MODULE_NOT_FOUND");
                router.push('/');
                return;
            }

            setTemplate(data);

            const initialValues: Record<string, string> = {};

            data.fields_config?.forEach((f: any) => {
                const key = f.variable_name; 
                initialValues[key] = f.default_value || "";
                
                console.log("SYNC_VARIABLE:", key, "VALUE:", initialValues[key]);
            });

            setValues(initialValues);
            setIsLoading(false);
        };

        if (id) fetchTemplate();
    }, [id, router]);

    // 2. BBCode Parser (Logic เดิมของคุณ Zoe ที่แม่นยำอยู่แล้ว)
    const parseBBCode = (text: string) => {
        if (!text) return "";

        const parseList = (input: string): string => {
            const findMatchingClose = (str: string, startIdx: number): number => {
                let depth = 1;
                let i = startIdx;
                while (i < str.length && depth > 0) {
                    if (str.startsWith('[list', i) && (str[i + 5] === ']' || str[i + 5] === '=')) {
                        depth++;
                        i += 6;
                    } else if (str.startsWith('[/list]', i)) {
                        depth--;
                        if (depth === 0) return i;
                        i += 7;
                    } else {
                        i++;
                    }
                }
                return -1;
            };

            let result = '';
            let i = 0;

            while (i < input.length) {
                const listMatch = input.slice(i).match(/^\[list(=1)?\]/);
                if (listMatch) {
                    const openTag = listMatch[0];
                    const isOrdered = listMatch[1] === '=1';
                    const contentStart = i + openTag.length;
                    const closeIdx = findMatchingClose(input, contentStart);

                    if (closeIdx !== -1) {
                        const content = input.slice(contentStart, closeIdx);
                        const parsedContent = parseList(content);

                        const items = parsedContent.split('[*]')
                            .slice(1)
                            .map((item: string) => item.trim())
                            .filter((item: string) => item !== '')
                            .map((item: string) => `<li>${item}</li>`)
                            .join('');

                        const tag = isOrdered ? 'ol type="1"' : 'ul';
                        result += `<${tag} class="mycode_list">${items}</${isOrdered ? 'ol' : 'ul'}>`;
                        i = closeIdx + '[/list]'.length;
                    } else {
                        result += input[i];
                        i++;
                    }
                } else {
                    result += input[i];
                    i++;
                }
            }

            return result;
        };

        let html = text
            .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<span style="font-weight: bold;" class="mycode_b">$1</span>')
            .replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<span style="font-style: italic;" class="mycode_i">$1</span>')
            .replace(/\[u\]([\s\S]*?)\[\/u\]/g, '<span style="text-decoration: underline;" class="mycode_u">$1</span>')
            .replace(/\[s\]([\s\S]*?)\[\/s\]/g, '<span style="text-decoration: line-through;" class="mycode_s">$1</span>')
            .replace(/\[align=(left|center|right|justify)\]([\s\S]*?)\[\/align\]/g, '<div style="text-align: $1;" class="mycode_align">$2</div>')
            .replace(/\[color=(#?[a-fA-F0-9]{3,6})\]([\s\S]*?)\[\/color\]/g, '<span style="color: $1;" class="mycode_color">$2</span>');

        html = parseList(html);

        html = html.replace(/\n/g, '<br>');
        html = html
            .replace(/<\/div><br>/g, '</div>')
            .replace(/<\/ul><br>/g, '</ul>')
            .replace(/<\/ol><br>/g, '</ol>')
            .replace(/<li><br>/g, '<li>')
            .replace(/<br><\/li>/g, '</li>');

        return html;
    };

    // 3. Live Preview Generator
    const previewHTML = useMemo(() => {
        if (!template) return "";
        let html = template.html_blueprint;
        
        Object.keys(values).forEach(key => {
            const field = template.fields_config?.find((f: any) => f.variable_name === key);
            let content = values[key];
            
            if (field?.type === 'bbcode') {
                content = parseBBCode(content);
            }
            
            html = html.replaceAll(`{{${key}}}`, content);
        });
        
        return html;
    }, [template, values]);

    // 4. Copy Logic
    const handleCopyCode = () => {
        const toastId = toast.loading("SYSTEM: Generating_Code...");
        try {
            let finalOutput = template.html_blueprint;
            Object.keys(values).forEach(key => {
                finalOutput = finalOutput.replaceAll(`{{${key}}}`, values[key]);
            });
            navigator.clipboard.writeText(finalOutput);
            toast.success("PROTOCOL_SUCCESS: CODE_COPIED", { id: toastId });
        } catch (err) {
            toast.error("FATAL_ERROR: COPY_FAILED", { id: toastId });
        }
    };

    if (isLoading) return <div className="p-10 text-center font-Google-Code animate-pulse text-(--primary)">LOADING_CORE_MODULE...</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs path={template.title || 'LOADING...'} currentFile="EDITOR" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span>&lt; BACK_TO_DASHBOARD</span>
                </button>
            </div>

            <div className="flex-1 lg:flex overflow-y-auto lg:overflow-hidden px-4 mb-4 scrollbar-hide">
                <div className="flex-none lg:flex-1 grid gap-4 grid-cols-none lg:grid-cols-2">
                    {/* Input Side */}
                    <div className="flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75 pb-2">
                                <h3 className="text-xl text-(--primary) uppercase">{template.title}'s Editor</h3>
                                <div className="flex-1 flex justify-end gap-1">
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            if(confirm("ยืนยันการล้างข้อมูลที่พิมพ์ค้างไว้ทั้งหมด?")) {
                                                localStorage.removeItem(STORAGE_KEY);
                                                window.location.reload();
                                            }
                                        }}
                                        className="text-[10px] opacity-30 hover:opacity-100 uppercase cursor-pointer flex gap-1"
                                    >
                                        <span className="hidden lg:inline content-center">[Clear_Draft]</span>
                                        <span className="lg:hidden content-center border border-white/50 px-2 py-0.5 mt-px">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                        </span>
                                    </button>
                                    <button 
                                        onClick={handleCopyCode}
                                        className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                            {template.fields_config?.map((field: any) => (
                                <div key={field.id} className="flex flex-col gap-2 font-Google-Sans">
                                    <div className="flex gap-2 items-center relative">
                                        <label className="text-sm uppercase opacity-70">{field.label}</label>
                                        {field.description && (
                                            <div className="group/tooltip flex md:relative">
                                                <button className="font-Google-Code border border-(--foreground)/50 bg-(--background) text-(--foreground) w-[12px] h-[12px] text-[8px] font-bold transition-all cursor-help opacity-50">
                                                    i
                                                </button>
                                                
                                                <div className="invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 mb-1 p-2 bg-black border border-(--primary)/50 z-50 min-w-[180px] max-w-8/10 transition-all duration-200">
                                                    <div className="text-[10px] uppercase opacity-50 mb-1 border-b border-(--primary)/75 pb-1">คำอธิบาย</div>
                                                    <div className="text-xs font-bold">
                                                        {field.description}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {field.type === 'color' ? (
                                        /* --- TYPE: COLOR --- */
                                        <div className="flex gap-2">
                                            <div className="relative w-10 h-10 border border-(--primary)/50 bg-black shrink-0 overflow-hidden">
                                                <input 
                                                    type="color" 
                                                    value={values[field.variable_name]?.startsWith('#') ? values[field.variable_name] : '#FFFFFF'}
                                                    onChange={(e) => setValues({...values, [field.variable_name]: e.target.value.toUpperCase()})}
                                                    className="absolute inset-[-5px] w-[200%] h-[200%] cursor-pointer bg-transparent"
                                                />
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder="#FFFFFF"
                                                value={values[field.variable_name] || ""}
                                                onChange={(e) => {
                                                    let val = e.target.value.toUpperCase();
                                                    if (val && !val.startsWith('#')) val = '#' + val;
                                                    setValues({...values, [field.variable_name]: val});
                                                }}
                                                className="flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300 font-Google-Code" 
                                            />
                                        </div>

                                    ) : field.type === 'select' ? (
                                        /* --- TYPE: SELECT --- */
                                        <div className="relative">
                                            <select 
                                                value={values[field.variable_name] || ""}
                                                onChange={(e) => setValues({...values, [field.variable_name]: e.target.value})}
                                                className="w-full bg-black/20 border border-(--primary)/50 p-2 text-sm outline-none appearance-none cursor-pointer focus:border-(--primary)/75 transition-all duration-300"
                                            >
                                                {field.options?.split('/').map((opt: string) => {
                                                    const [optLabel, optVal] = opt.split(':');
                                                    return (
                                                        <option key={optVal} value={optVal?.trim()} className="bg-black text-white">
                                                            {optLabel?.trim()}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {/* ไอคอนลูกศรสำหรับ Select */}
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                                            </div>
                                        </div>

                                    ) : field.type === 'bbcode' ? (
                                        /* --- TYPE: BBCODE --- */
                                        <div>
                                            <BBCodeEditor 
                                                value={values[field.variable_name] || ""} 
                                                onChange={(val) => setValues({...values, [field.variable_name]: val})}
                                            />
                                        </div>

                                    ) : (
                                        /* --- TYPE: TEXT (Default) --- */
                                        <input 
                                            type="text" 
                                            placeholder={field.placeholder || `ENTER_${(field.variable_name || 'VALUE').toUpperCase()}...`}
                                            value={values[field.variable_name] || ""}
                                            onChange={(e) => setValues({...values, [field.variable_name]: e.target.value})}
                                            className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300 placeholder:opacity-20 font-Google-Code"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live Preview Side */}
                    <div className="flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="hidden lg:flex flex-1 flex-col bg-[#1a1a1a]">
                            <div className="p-2 border-b border-white/5 bg-black/40 flex items-center gap-2">
                                <div className="flex gap-1.5 ml-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                                </div>
                                <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold ml-2">Live_Transmission_Preview</span>
                            </div>
                            <div className="flex-1 relative">
                                <iframe 
                                    srcDoc={`
                                        <html>
                                            <head>
                                                <style>
                                                    body { margin: 0; padding: 20px; display: flex; justify-content: center; background: transparent; }
                                                    ::-webkit-scrollbar { width: 5px; }
                                                    ::-webkit-scrollbar-thumb { background: #333; }
                                                </style>
                                            </head>
                                            <body>${previewHTML}</body>
                                        </html>
                                    `}
                                    className="w-full h-full border-none"
                                    sandbox="allow-popups allow-scripts"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}