"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import BBCodeEditor from '@/components/BBCodeEditor';
import Link from 'next/link';

export default function EditorPage() {
    const { id } = useParams();
    const [template, setTemplate] = useState<any>(null);
    const [fields, setFields] = useState<any[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});

    const [pass, setPass] = useState("");
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [error, setError] = useState(false);
  
    useEffect(() => {
        const fetchTemplate = async () => {
            const { data } = await supabase.from('templates').select('*').eq('id', id).single();
            setTemplate(data);
        };
    
        const fetchFields = async () => {
            const { data } = await supabase.from('template_fields').select('*').eq('template_id', id).order('order_index');
            if (data) {
                setFields(data);
                
                const initialValues: Record<string, string> = {};
                data.forEach((f: any) => {
                    initialValues[f.field_key] = "";
                });
                setValues(initialValues);
            }
        };
        
        fetchTemplate();
        fetchFields();
    }, [id]);

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

    const generatePreview = () => {
        if (!template) return "";
        let html = template.html_blueprint;
        
        Object.keys(values).forEach(key => {
            let content = values[key];
            
            const field = fields.find(f => f.field_key === key);
            if (field?.type === 'bbcode') {
                content = parseBBCode(content);
            }
            
            html = html.replaceAll(`{{${key}}}`, content);
        });
        
        return html;
    };

    if (!template) return <div className="p-10 text-center">กำลังโหลด...</div>;

    if (template?.is_personal && !isUnlocked) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#f8f9fa]">
                <div className="bg-white p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] w-full max-w-sm text-center border border-gray-100">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">🔒</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">พื้นที่ส่วนตัว</h2>
                    <p className="text-gray-500 text-sm mb-8">กรุณากรอกรหัสผ่านเพื่อเข้าถึงโหมดแก้ไขเทมเพลตนี้</p>
                    
                    <div className="space-y-4">
                        <input 
                            type="password" 
                            autoFocus
                            className={`w-full bg-gray-50 border ${error ? 'border-red-400 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'} p-4 rounded-2xl outline-none focus:ring-4 transition-all text-center text-lg`}
                            placeholder="••••••••"
                            onChange={(e) => { setPass(e.target.value); setError(false); }}
                            onKeyDown={(e) => e.key === 'Enter' && (pass === template.password ? setIsUnlocked(true) : setError(true))}
                        />
                        {error && <p className="text-red-500 text-xs animate-bounce">รหัสผ่านไม่ถูกต้อง ลองอีกครั้งนะ!</p>}
                    
                        <button 
                            onClick={() => pass === template.password ? setIsUnlocked(true) : setError(true)}
                            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-black hover:shadow-lg active:scale-[0.98] transition-all"
                        >
                            เข้าสู่ระบบ
                        </button>
                    
                        <button 
                            onClick={() => window.location.href = '/'}
                            className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
                        >
                            ← กลับหน้าหลัก
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="p-4 border-b flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-black transition">
                    <span>🏠</span> Dashboard
                </Link>
                <div className="text-xs text-gray-300">Editor Mode</div>
            </div>

            <div className="flex h-screen overflow-hidden">
                {/* ฝั่งซ้าย: Editor Inputs */}
                <div className="w-1/2 p-6 overflow-y-auto border-r bg-gray-50">
                    <h1 className="text-xl font-bold mb-4">{template.title}</h1>
                    <div className="space-y-4">
                        {fields.map((field) => (
                            <div key={field.id} className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                                {field.type === 'bbcode' ? (
                                    <BBCodeEditor 
                                        value={values[field.field_key] || ""} 
                                        onChange={(val) => setValues({...values, [field.field_key]: val})}
                                    />
                                ) : (
                                    <input 
                                        type="text"
                                        className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={values[field.field_key] || ""}
                                        onChange={(e) => setValues({...values, [field.field_key]: e.target.value})}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ฝั่งขวา: Live Preview */}
                <div className="w-1/2 flex flex-col">
                    <div className="p-2 border-b bg-white flex justify-between items-center">
                        <span className="font-semibold">Live Preview</span>
                        <button 
                            onClick={() => {
                                let finalBBCode = template.html_blueprint;
                                Object.keys(values).forEach(key => {
                                    finalBBCode = finalBBCode.replaceAll(`{{${key}}}`, values[key]);
                                });
                                navigator.clipboard.writeText(finalBBCode);
                                alert("คัดลอก BBCode แล้ว!");
                            }}
                            className="bg-green-500 text-white px-4 py-1 rounded text-sm hover:bg-green-600"
                            >
                            คัดลอกโค้ด
                        </button>
                    </div>
                    <div className="flex-1 bg-white">
                        <iframe 
                            srcDoc={`<html><body>${generatePreview()}</body></html>`}
                            className="w-full h-full border-none"
                            sandbox="allow-popups"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}