"use client"; // ต้องใส่เพราะหน้าจอนี้มีการโต้ตอบ (State)

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

export default function EditorPage() {
    const { id } = useParams();
    const [template, setTemplate] = useState<any>(null);
    const [fields, setFields] = useState<any[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
  
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
  
    const generatePreview = () => {
        if (!template) return "";
        let html = template.html_blueprint;
        Object.keys(values).forEach(key => {
            html = html.replaceAll(`{{${key}}}`, values[key]);
        });
        return html;
    };

    if (!template) return <div className="p-10 text-center">กำลังโหลด...</div>;

    return (
        <div className="flex h-screen overflow-hidden">
            {/* ฝั่งซ้าย: Editor Inputs */}
            <div className="w-1/2 p-6 overflow-y-auto border-r bg-gray-50">
                <h1 className="text-xl font-bold mb-4">{template.title}</h1>
                <div className="space-y-4">
                    {fields.map((field) => (
                        <div key={field.id}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                            {field.type === 'bbcode' ? (
                                <textarea 
                                    className="w-full border p-2 rounded h-32"
                                    value={values[field.field_key]}
                                    onChange={(e) => setValues({...values, [field.field_key]: e.target.value})}
                                />
                            ) : (
                                <input 
                                    type="text"
                                    className="w-full border p-2 rounded"
                                    value={values[field.field_key]}
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
                        onClick={() => navigator.clipboard.writeText(generatePreview())}
                        className="bg-green-500 text-white px-4 py-1 rounded text-sm hover:bg-green-600"
                    >
                        คัดลอกโค้ด HTML
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
    );
}