"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { FieldConfig, syncFieldsFromHTML, generateFinalHTML } from '@/lib/template-parser';

import Modal from '@/components/Modal';
import Breadcrumbs from '@/components/Breadcrumbs';
import FieldRenderer from '@/components/FieldRenderer';

export default function EditorPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const templateId = params.id;
    
    const STORAGE_KEY = `zzzcode_draft_editor_${templateId}`;
    const fromGroup = searchParams.get('group') || 'category';
    const fromTag = searchParams.get('tag') || 'all';
    const breadcrumbPath = `${fromGroup}:${fromTag}`;

    // --- 1. States ---
    const [modalType, setModalType] = useState<'clear_draft' | null>(null);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        html_blueprint: '',
    });

    const [fields, setFields] = useState<FieldConfig[]>([]);
    const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

    // --- 2. Computed Preview ---
    const liveHTML = useMemo(() => {
        if (!formData.html_blueprint) return "";
        return generateFinalHTML(formData.html_blueprint, fieldValues, fields, true);
    }, [formData.html_blueprint, fieldValues, fields]);

    // Grouping Field
    const groupedFields = useMemo(() => {
        const groups: Record<string, FieldConfig[]> = {};
        
        fields.forEach(f => {
            if (!groups[f.group_name]) groups[f.group_name] = [];
            groups[f.group_name].push(f);
        });

        return Object.entries(groups)
            .sort(([, a], [, b]) => {
                const orderA = a[0]?.group_order ?? 0;
                const orderB = b[0]?.group_order ?? 0;
                return orderA - orderB;
            })
            .reduce((acc, [key, val]) => {
                acc[key] = [...val].sort((a, b) => (a.field_order ?? 0) - (b.field_order ?? 0));
                return acc;
            }, {} as Record<string, FieldConfig[]>);
    }, [fields]);

    // --- 3. Effects ---

    useEffect(() => {
        const initEditorPage = async () => {
            setLoading(true);
            if (templateId) {
                const { data: template } = await supabase.from('templates').select('*').eq('id', templateId).single();

                if (template) {
                    const initialData = {
                        title: template.title,
                        description: template.description,
                        html_blueprint: template.html_blueprint,
                    };
                    
                    setFormData(initialData);
                    const initialFields = (template.fields_config || []).sort((a: any, b: any) => {
                        if (a.group_order !== b.group_order) {
                            return (a.group_order ?? 0) - (b.group_order ?? 0);
                        }
                        return (a.field_order ?? 0) - (b.field_order ?? 0);
                    });
                    setFields(initialFields);
                    
                    const defaults: any = {};
                    initialFields.forEach((f: FieldConfig) => {
                        defaults[f.variable_name] = f.default_value;
                    });
                    setFieldValues(defaults);

                    // Check Local Draft
                    const savedDraft = localStorage.getItem(STORAGE_KEY);
                    if (savedDraft) {
                        try {
                            const parsed = JSON.parse(savedDraft);
                            if (parsed.templateId === templateId) {
                                setFormData(parsed.formData);
                                setFields(parsed.fields);
                                setFieldValues(parsed.fieldValues || defaults);
                            }
                        } catch (e) { console.error(e); }
                    }
                }
            }
            setLoading(false);
        };
        initEditorPage();
    }, [templateId]);

    // Auto-Save Draft
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.title || formData.html_blueprint) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
                    templateId, formData, fields, fieldValues 
                }));
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [formData, fields, fieldValues]);

    // --- 4. Handlers ---
    const handleValueChange = (varName: string, value: any) => {
        setFieldValues(prev => ({ ...prev, [varName]: value }));
    };

    const handleClearDraft = () => {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    };

    const handleCopy = async () => {
        if (!liveHTML) return;

        try {
            const copyHTML = generateFinalHTML(formData.html_blueprint, fieldValues, fields, false);
            
            await navigator.clipboard.writeText(copyHTML);
            
            toast.success("SYSTEM: HTML_COPIED_TO_CLIPBOARD");
        } catch (err) {
            toast.error("CRITICAL_ERROR: Failed to copy");
        }
    };

    if (loading) return <div className="p-10 font-Google-Code text-xs animate-pulse">SYSTEM: LOADING_CORE...</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs path={breadcrumbPath} currentFile={formData.title} editorMode="EDITOR" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <div className="flex-1 lg:flex overflow-y-auto lg:overflow-hidden px-4 mb-4 scrollbar-hide">
                <div className="lg:flex-1 grid gap-4 grid-cols-none lg:grid-cols-2">
                    {/* Input */}
                    <div className="max-lg:row-[2/3] flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75 pb-2">
                                <h3 className="text-xl text-(--primary) uppercase">Input_Fields</h3>
                                <div className="flex-1 flex justify-end gap-1">
                                    <button 
                                        type="button"
                                        onClick={() => setModalType('clear_draft')}
                                        className="text-[10px] opacity-30 hover:opacity-100 uppercase cursor-pointer flex gap-1"
                                    >
                                        <span className="hidden lg:inline content-center">[Clear_Draft]</span>
                                        <span className="lg:hidden content-center border border-white/50 px-2 py-0.5 mt-px">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-6 overflow-y-auto scrollbar-hide">
                            {Object.entries(groupedFields).map(([groupName, groupFields]) => {
                                const totalFields = groupFields.length;
                                
                                return (
                                    <div key={groupName}>
                                        <div className="flex items-center gap-2 px-2 py-1 bg-(--primary)/5 border-l-2 border-(--primary) mb-2 select-none">
                                            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-(--primary)">
                                                {groupName}
                                            </h4>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {groupFields.map((field, index) => {
                                                const isWide = field.type === "bbcode" ||  totalFields === 1 ||  (totalFields > 2 && index === 0);

                                                return (
                                                    <FieldRenderer 
                                                        key={field.id}
                                                        field={field}
                                                        value={fieldValues[field.variable_name]}
                                                        onChange={handleValueChange}
                                                        className={isWide ? "lg:col-span-2" : "col-span-1"}
                                                    />
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Live Previews */}
                    <div className="max-lg:row-[1/2] max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:max-h-[40vh] flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75 pb-2">
                                <h3 className="text-xl text-(--primary) uppercase">Live_Preview</h3>
                                <button 
                                    type="button" 
                                    disabled={loading || !liveHTML}
                                    onClick={handleCopy}
                                    className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                            {/* generate Live Preview */}
                            <div id="preview-container"
                                className="preview-content prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: liveHTML || '<p style="color: #ccc">Blueprint is empty...</p>' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <Modal 
                isOpen={modalType !== null} 
                onClose={() => setModalType(null)} 
                title={modalType === 'clear_draft' ? 'Memory Wipe Confirmation' : ''}
            >
                {modalType === 'clear_draft' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-red-500 mb-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="16" x2="12" y2="18"></line>
                            </svg>
                            <span className="text-xs uppercase font-black tracking-[0.2em]">Destructive_Action</span>
                        </div>

                        <div className="space-y-2">
                            <p className="text-white/60 text-xs leading-relaxed">
                                คุณแน่ใจหรือไม่ที่จะล้าง <span className="text-red-400 font-bold">"ข้อมูลดราฟต์ทั้งหมด"</span>?
                            </p>
                            <p className="text-[10px] text-white/40 uppercase leading-tight">
                                Warning: This will permanently delete all unsaved progress in this session. 
                                Local cache will be purged and the module will reset.
                            </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button 
                                type="button"
                                onClick={() => setModalType(null)}
                                className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                            >
                                Abort
                            </button>
                            <button 
                                type="button"
                                onClick={handleClearDraft}
                                className="cursor-pointer flex-1 py-2 bg-red-600 text-white font-bold uppercase text-xs hover:bg-red-500 transition-all"
                            >
                                Confirm_Wipe
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}