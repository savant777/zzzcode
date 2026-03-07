"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Breadcrumbs from '@/components/Breadcrumbs';

// --- Interfaces ---
interface TemplateField {
    id: string;
    variable_name: string;
    label: string;
    type: 'text' | 'color' | 'bbcode' | 'select';
    default_value: string;
    placeholder: string;
    description: string;
    options?: string;
    order: number;
}

export default function EditTemplatePage() {
    const params = useParams();
    const templateId = params.id;

    const router = useRouter();
    const STORAGE_KEY = 'zzzcode_draft_edit_${templateId}';

    // --- 1. States ---
    const [loading, setLoading] = useState(false);
    const [isTagsExpanded, setIsTagsExpanded] = useState(false);
    const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
    const [editingField, setEditingField] = useState<TemplateField | null>(null);
    
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [fields, setFields] = useState<TemplateField[]>([]);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        preview_url: '',
        is_personal: false,
        password: '',
        html_blueprint: '',
    });

    // --- 2. Effects ---

    // Load Tags & Draft on Mount
    useEffect(() => {
        const initEditPage = async () => {
            setLoading(true);
            
            const { data: allTags } = await supabase
                .from('tags')
                .select('id, name')
                .eq('is_active', true);
            
            if (allTags) setAvailableTags(allTags);
            
            if (templateId) {
                const { data: template, error } = await supabase
                    .from('templates')
                    .select(`*, template_tags(tags_id)`)
                    .eq('id', templateId)
                    .single();

                if (template) {
                    setFormData({
                        title: template.title || '',
                        description: template.description || '',
                        preview_url: template.preview_url || '',
                        is_personal: template.is_personal || false,
                        password: template.password || '',
                        html_blueprint: template.html_blueprint || '',
                    });
                    setFields(template.fields_config || []);
                    
                    const oldTagIds = template.template_tags?.map((t: any) => t.tags_id) || [];
                    setSelectedTags(oldTagIds);
                }
            }
            
            const savedDraft = localStorage.getItem(`zzzcode_draft_edit_${templateId}`);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    
                    if (parsed.formData) setFormData(parsed.formData);
                    if (parsed.selectedTags) setSelectedTags(parsed.selectedTags);

                    if (parsed.fields && parsed.fields.length > 0) {
                        setFields(parsed.fields);
                    } else if (parsed.formData?.html_blueprint) {
                        syncFieldsFromHTML(parsed.formData.html_blueprint);
                    }
                } catch (e) {
                    console.error("Failed to load draft:", e);
                }
            }

            setLoading(false);
        };
        initEditPage();
    }, [templateId]);

    // Auto-Save Draft
    useEffect(() => {
        if (formData.title || formData.html_blueprint || fields.length > 0 || selectedTags.length > 0) {
            const draft = { 
                formData, 
                fields, 
                selectedTags 
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        }
    }, [formData, fields, selectedTags]);

    // --- 3. Helper Functions ---

    const clearDraft = () => localStorage.removeItem(STORAGE_KEY);

    const getFirstValue = (optionsString: string) => {
        const firstOption = optionsString.split('/')[0]?.trim();
        if (!firstOption) return '';
        return firstOption.includes(':') ? firstOption.split(':')[1].trim() : firstOption;
    };

    const syncFieldsFromHTML = (html: string) => {
        setFormData(prev => ({ ...prev, html_blueprint: html }));
        
        const regex = /{{(.*?)}}/g;
        const matches = [...html.matchAll(regex)];
        const varNames = [...new Set(matches.map(m => m[1].trim()))];

        setFields(prev => {
            const existingFields = prev.filter(f => varNames.includes(f.variable_name));
            const newVarNames = varNames.filter(v => !prev.some(f => f.variable_name === v));
            
            const newFields: TemplateField[] = newVarNames.map((v, index) => ({
                id: crypto.randomUUID(),
                variable_name: v,
                label: v,
                type: 'text',
                default_value: '',
                placeholder: `Enter ${v}...`,
                description: '',
                order: existingFields.length + index
            }));
            
            return [...existingFields, ...newFields].sort((a, b) => a.order - b.order);
        });
    };

    // --- 4. Event Handlers ---

    const moveField = (index: number, direction: 'up' | 'down') => {
        const newFields = [...fields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newFields.length) return;
        
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        setFields(newFields.map((field, i) => ({ ...field, order: i })));
    };

    const handleOpenEdit = (field: TemplateField) => {
        setEditingField({ ...field });
        setIsFieldModalOpen(true);
    };

    const handleSaveFieldConfig = (updatedField: TemplateField) => {
        setFields(prev => prev.map(f => f.id === updatedField.id ? updatedField : f));
        setIsFieldModalOpen(false);
        setEditingField(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading("SYSTEM: Updating_Module...");

        try {
            const { error: updateError } = await supabase
                .from('templates')
                .update({
                    ...formData,
                    fields_config: fields,
                })
                .eq('id', templateId);

            if (updateError) throw updateError;

            await supabase.from('template_tags').delete().eq('template_id', templateId);
            
            if (selectedTags.length > 0) {
                const tagEntries = selectedTags.map(tagId => ({
                    template_id: templateId,
                    tags_id: tagId
                }));
                await supabase.from('template_tags').insert(tagEntries);
            }

            toast.success("PROTOCOL_SUCCESS: MODULE_UPDATED", { id: toastId });
            router.push('/');
            router.refresh();

        } catch (error: any) {
            toast.error(`CRITICAL_ERROR: ${error.message}`, { id: toastId });
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs path={formData.title || 'LOADING...'} currentFile="EDIT" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span>&lt; BACK_TO_DASHBOARD</span>
                </button>
            </div>

            <div className="flex-1 lg:flex overflow-y-auto lg:overflow-hidden px-4 mb-4 scrollbar-hide">
                <form onSubmit={handleSubmit} className="flex-none lg:flex-1 grid gap-4 grid-cols-none lg:grid-cols-2">
                    {/* Template */}
                    <div className="flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75 pb-2">
                                <h3 className="text-xl text-(--primary) uppercase">Template_Info</h3>
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
                                        type="submit" 
                                        disabled={loading}
                                        className="bg-(--primary) text-(--background) px-4 py-1 text-xs font-black uppercase hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        {loading ? 'Processing...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm uppercase opacity-70">Template_Title</label>
                                <input 
                                    required
                                    type="text"
                                    value={formData.title}
                                    placeholder="e.g. Template01"
                                    className="font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300"
                                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                                />
                            </div>
                            
                            <div className="flex flex-col gap-1">
                                <label className="text-sm uppercase opacity-70">Description</label>
                                <textarea 
                                    rows={1}
                                    value={formData.description}
                                    placeholder="คำอธิบายโคด"
                                    className="font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300 resize-none"
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm uppercase opacity-70">Assign_Tags</label>
                                    <button 
                                        type="button"
                                        onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                                        className="text-[10px] text-(--primary) hover:underline cursor-pointer uppercase"
                                    >
                                        [{isTagsExpanded ? 'Collapse_Tags' : 'Expand_Tags'}]
                                    </button>
                                </div>
                                <div className={`
                                    flex flex-wrap gap-2 p-2 border border-(--primary)/50 bg-black/20 transition-all duration-300
                                    ${isTagsExpanded ? 'max-h-[500px] overflow-y-auto' : 'max-h-[42px] overflow-hidden'}
                                `}>
                                    {availableTags.map(tag => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedTags(prev => 
                                                    prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                                );
                                            }}
                                            className={`px-2 py-1 text-xs font-bold border transition-all cursor-pointer uppercase
                                                ${selectedTags.includes(tag.id) 
                                                    ? 'bg-(--primary) text-(--background) border-(--primary)' 
                                                    : 'text-(--foreground)/75 bg-(--background) border-(--foreground)/25 hover:text-(--background) hover:bg-(--foreground)'}
                                            `}
                                        >
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm uppercase opacity-70">Personal_Info</label>
                                <div className="flex gap-2">
                                    <label className="flex h-full aspect-square items-center gap-2 cursor-pointer group relative">
                                        <input 
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formData.is_personal}
                                            onChange={(e) => setFormData({...formData, is_personal: e.target.checked})}
                                        />
                                        <div className="w-full h-full bg-black/20 border border-(--primary)/50 focus:border-(--primary)/75 transition-all duration-300
                                            flex items-center justify-center p-2">
                                            {formData.is_personal && (
                                                <div className="w-4/5 h-4/5 bg-(--primary) animate-in zoom-in-50 duration-200" />
                                            )}
                                        </div>
                                    </label>
                                    <input 
                                        required={formData.is_personal}
                                        type="text"
                                        value={formData.password}
                                        placeholder={formData.is_personal ? "ENTER_SECRET_KEY" : "ANYONE_CAN_USE"}
                                        className={`
                                            flex-1 min-w-0 font-Google-Sans p-2 outline-none border transition-all duration-300
                                            ${formData.is_personal 
                                                ? 'bg-black/20 border-(--primary)/50 focus:border-(--primary)/75' 
                                                : 'bg-black/20 border-(--foreground)/15 text-(--foreground)/15 cursor-not-allowed'}
                                        `}
                                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        disabled={!formData.is_personal}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm uppercase opacity-70">Preview_Image</label>
                                <input 
                                    type="text" 
                                    value={formData.preview_url}
                                    placeholder="https://cloudinary.com/..."
                                    className="font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300"
                                    onChange={(e) => setFormData({...formData, preview_url: e.target.value})}
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm uppercase opacity-70">HTML_Blueprint</label>
                                <textarea 
                                    rows={6}
                                    placeholder="<div class='card'>{{content}}</div>"
                                    className="font-Google-Code bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300 resize-y scrollbar-hide"
                                    onChange={(e) => syncFieldsFromHTML(e.target.value)}
                                    value={formData.html_blueprint} 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Fields */}
                    <div className="flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75">
                                <h3 className="text-xl text-(--primary) uppercase">Template_Fields</h3>
                                <span className="text-sm opacity-40 uppercase tracking-tighter">Detected: {fields.length}</span>
                            </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                            {fields.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest">
                                    Awaiting_Blueprint_Input...
                                </div>
                            ) : (
                                fields.map((field, index) => (
                                    <div key={field.id} className="group flex gap-4 p-2 border border-(--primary)/50 bg-black/20 hover:border-(--primary)/75 transition-all">

                                        {/* Order Buttons */}
                                        <div className="flex flex-col gap-1 min-w-[28px] justify-center">
                                            <button type="button" onClick={() => moveField(index, 'up')} className="text-sm text-(--primary) border border-(--primary)/50 hover:border-(--primary)/75 hover:bg-(--primary)/15 transition-color duration-300 cursor-pointer">▲</button>
                                            <button type="button" onClick={() => moveField(index, 'down')} className="text-sm text-(--primary) border border-(--primary)/50 hover:border-(--primary)/75 hover:bg-(--primary)/15 transition-color duration-300 cursor-pointer">▼</button>
                                        </div>

                                        {/* Field Preview Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] text-(--primary) font-bold truncate">{"{{" + field.variable_name + "}}"}</p>
                                            <h4 className="font-Google-Sans font-bold truncate uppercase">{field.label}</h4>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-[8px] px-1 bg-(--primary)/15 text-(--primary) uppercase">{field.type}</span>
                                                {field.default_value && <span className="text-[8px] opacity-40 truncate">Val: {field.default_value}</span>}
                                            </div>
                                        </div>

                                        {/* Edit Trigger */}
                                        <button 
                                            type="button"
                                            onClick={() => handleOpenEdit(field)}
                                            className="max-h-fit self-center p-3 border border-(--primary)/50 text-(--primary) text-[10px] font-black hover:bg-(--primary)/15 transition-all cursor-pointer uppercase"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {isFieldModalOpen && editingField && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

                    <div className="relative w-full max-w-md border border-(--primary) bg-(--background) p-6 font-Google-Code animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="mb-4 flex items-start justify-between border-b border-(--primary)/20 pb-3">
                            <div>
                                <h3 className="text-base md:text-lg mt-[-4px] uppercase tracking-widest text-(--primary)">Configure_Field</h3>
                                <p className="text-[10px] opacity-50">VARIABLE: {"{{" + editingField.variable_name + "}}"}</p>
                            </div>
                            <button onClick={() => setIsFieldModalOpen(false)} className="hover:text-(--primary) transition-colors cursor-pointer select-none">✕</button>
                        </div>

                        {/* Content */}
                        <div className="text-sm">
                            <div className="space-y-4">
                                {/* Label & Type */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase opacity-60">Display_Label</label>
                                        <input 
                                            type="text" 
                                            value={editingField.label}
                                            onChange={(e) => setEditingField({...editingField, label: e.target.value})}
                                            className="bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase opacity-60">Input_Type</label>
                                        <select 
                                            value={editingField.type}
                                            onChange={(e) => setEditingField({...editingField, type: e.target.value as any})}
                                            className="bg-black/20 border border-(--primary)/50 p-2 text-sm text-(--primary) outline-none appearance-none cursor-pointer focus:border-(--primary)/75 transition-all duration-300"
                                        >
                                            <option value="text" className="bg-black">Text</option>
                                            <option value="color"  className="bg-black">Color</option>
                                            <option value="bbcode"  className="bg-black">BB Code</option>
                                            <option value="select"  className="bg-black">Select Menu</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Conditional Field: Options (เฉพาะตอนเลือก Select) */}
                                {editingField.type === 'select' && (
                                    <div className="flex flex-col gap-1 animate-in slide-in-from-top-2">
                                        <label className="text-[10px] uppercase text-(--primary) font-bold">Select_Options (Separate with /)</label>
                                        <input 
                                            type="text" 
                                            placeholder="Option1:Value1 / Option2:Value2"
                                            value={editingField.options || ''}
                                            onChange={(e) => {
                                                const newOptions = e.target.value;
                                                const autoDefault = getFirstValue(newOptions);
                                                
                                                setEditingField({
                                                    ...editingField, 
                                                    options: newOptions,
                                                    default_value: autoDefault,
                                                    placeholder: autoDefault
                                                });
                                            }}
                                            className="bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300" 
                                        />
                                        <p className="text-[9px] opacity-40 mt-1">
                                            * ระบบจะใช้ <span className="text-yellow-500 font-bold underline">{getFirstValue(editingField.options || '') || '...'}</span> เป็นค่าเริ่มต้น
                                        </p>
                                    </div>
                                )}

                                {/* Conditional Field: Color Picker (เฉพาะตอนเลือก Color) */}
                                {editingField.type === 'color' && (
                                    <div className="flex flex-col gap-1 animate-in slide-in-from-bottom-2">
                                        <label className="text-[10px] uppercase text-(--primary) font-bold">
                                            Initial_Color_Value (HEX)
                                        </label>
                                        <div className="flex gap-2">
                                            {/* กล่องจิ้มสี (Color Picker) */}
                                            <div className="relative w-10 h-10 border border-(--primary)/50 bg-black shrink-0 overflow-hidden">
                                                <input 
                                                    type="color" 
                                                    value={editingField.default_value.startsWith('#') ? editingField.default_value : '#FFFFFF'}
                                                    onChange={(e) => setEditingField({...editingField, default_value: e.target.value.toUpperCase(), placeholder: e.target.value.toUpperCase()})}
                                                    className="absolute inset-[-5px] w-[200%] h-[200%] cursor-pointer bg-transparent"
                                                />
                                            </div>
                                            
                                            {/* ช่องพิมพ์รหัสสี */}
                                            <input 
                                                type="text" 
                                                placeholder="#FFFFFF"
                                                value={editingField.default_value}
                                                onChange={(e) => {
                                                    let val = e.target.value.toUpperCase();
                                                    if (val && !val.startsWith('#')) {
                                                        val = '#' + val;
                                                    }
                                                    if (val.length <= 9) {
                                                        setEditingField({...editingField, default_value: val, placeholder: val});
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (editingField.default_value === '#') {
                                                        setEditingField({...editingField, default_value: '', placeholder: ''});
                                                    }
                                                }}
                                                className="flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300" 
                                            />
                                        </div>
                                        <p className="text-[9px] opacity-40 italic mt-1">* คลิกที่กล่องสีเพื่อเปิด Color Picker หรือพิมพ์รหัส HEX ลงในช่อง</p>
                                    </div>
                                )}

                                {/* Default Value & Placeholder */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase opacity-60">Default_Value / Placeholder</label>
                                    <input 
                                        type="text" 
                                        value={editingField.default_value}
                                        onChange={(e) => setEditingField({...editingField, default_value: e.target.value, placeholder: e.target.value})}
                                        className="bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary)" 
                                    />
                                </div>

                                {/* Description */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase opacity-60">Field_Instruction</label>
                                    <textarea 
                                        rows={2}
                                        value={editingField.description}
                                        onChange={(e) => setEditingField({...editingField, description: e.target.value})}
                                        className="bg-black/40 border border-(--primary)/40 p-2 text-xs outline-none focus:border-(--primary) resize-none" 
                                        placeholder="คำอธิบายสั้นๆ สำหรับฟิลด์นี้..."
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-8 flex gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setIsFieldModalOpen(false)}
                                    className="flex-1 py-2 border border-white/10 text-[10px] uppercase hover:bg-white/5 transition-all cursor-pointer"
                                >
                                    Discard
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => handleSaveFieldConfig(editingField)}
                                    className="flex-1 py-2 bg-(--primary) text-black font-black text-[10px] uppercase hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]"
                                >
                                    Apply_Protocol
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}