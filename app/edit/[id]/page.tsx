"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

import Modal from '@/components/Modal';
import Breadcrumbs from '@/components/Breadcrumbs';
import ColorPicker from '@/components/ColorPicker';
import TemplateBlockContainer from '@/components/TemplateBlockContainer';
import { FieldConfig, syncFieldsFromHTML, reorderFields, reorderGroups, reorderBlocks } from '@/lib/template-parser';

export default function EditTemplatePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const templateId = params.id;

    const router = useRouter();
    const STORAGE_KEY = 'zzzcode_draft_edit_${templateId}';

    const fromGroup = searchParams.get('group') || 'category';
    const fromTag = searchParams.get('tag') || 'all';
    const breadcrumbPath = `${fromGroup.toUpperCase()}:${fromTag.toUpperCase()}`;

    // --- 1. States ---
    
    const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
    const [editingField, setEditingField] = useState<FieldConfig | null>(null);

    const [loading, setLoading] = useState(true);
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isTagsExpanded, setIsTagsExpanded] = useState(false);
    const [fields, setFields] = useState<FieldConfig[]>([]);
    const [modalType, setModalType] = useState<'clear_draft' | null>(null);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        preview_url: '',
        is_personal: false,
        password: '',
        html_blueprint: '',
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const nestedData = useMemo(() => {
        const blocks: Record<string, Record<string, FieldConfig[]>> = {};

        fields.forEach(f => {
            const bName = f.block_name || "GLOBAL";
            const gName = f.group_name || "General";
            if (!blocks[bName]) blocks[bName] = {};
            if (!blocks[bName][gName]) blocks[bName][gName] = [];
            blocks[bName][gName].push(f);
        });

        return Object.entries(blocks)
            .sort(([nameA, groupsA], [nameB, groupsB]) => {
                const orderA = Object.values(groupsA)[0][0].block_order || 0;
                const orderB = Object.values(groupsB)[0][0].block_order || 0;
                return orderA - orderB;
            })
            .reduce((acc, [bName, groups]) => {
                acc[bName] = Object.entries(groups)
                    .sort(([, a], [, b]) => (a[0].group_order || 0) - (b[0].group_order || 0))
                    .reduce((gAcc, [gName, fList]) => {
                        gAcc[gName] = fList.sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
                        return gAcc;
                    }, {} as Record<string, FieldConfig[]>);
                return acc;
            }, {} as Record<string, Record<string, FieldConfig[]>>);
    }, [fields]);

    // --- 2. Effects ---
    
    // Load Tags & Draft on Mount
    useEffect(() => {
        const initEditPage = async () => {
            setLoading(true);
            const { data: allTags } = await supabase.from('tags').select('id, name').eq('is_active', true);
            if (allTags) setAvailableTags(allTags);

            if (templateId) {
                const { data: template, error } = await supabase.from('templates').select(`*, template_tags(tags_id)`).eq('id', templateId).single();

                if (template) {
                    setFormData({
                        title: template.title,
                        description: template.description,
                        preview_url: template.preview_url,
                        is_personal: template.is_personal,
                        password: template.password || '',
                        html_blueprint: template.html_blueprint,
                    });
                    setFields(template.fields_config || []);
                    
                    const oldTagIds = template.template_tags?.map((t: any) => t.tags_id) || [];
                    setSelectedTags(oldTagIds);
                }
            }

            const savedDraft = localStorage.getItem(STORAGE_KEY);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed.templateId === templateId) {
                        if (parsed.formData) setFormData(parsed.formData);
                        if (parsed.selectedTags) setSelectedTags(parsed.selectedTags);
                        if (parsed.fields) setFields(parsed.fields);
                    } else {
                        localStorage.removeItem(STORAGE_KEY);
                    }
                } catch (e) { console.error(e); }
            }

            setLoading(false);
        };
        initEditPage();
    }, [templateId]);

    // Smart Sync
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.html_blueprint) {
                const synced = syncFieldsFromHTML(formData.html_blueprint, fields);
                setFields(synced);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [formData.html_blueprint]);
    
    // Auto-Save Draft (Debounced 2s)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.title || formData.html_blueprint) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, formData, fields, selectedTags }));
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [formData, fields, selectedTags]);

    // --- 4. Handlers ---
    
    // drag and drop to re-order block
    const handleBlockDragEnd = (event: any) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const updated = reorderBlocks(fields, active.id, over.id);
            setFields(updated);
        }
    };

    // drag and drop to re-order group
    const handleGroupDragEnd = (event: any, blockName: string) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const updated = reorderGroups(fields, blockName, active.id, over.id);
            setFields(updated);
        }
    };

    // drag and drop to re-order field
    const handleFieldDragEnd = (event: any, groupName: string) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const updated = reorderFields(fields, groupName, active.id, over.id);
            setFields(updated);
        }
    };

    const handleOpenEdit = (field: FieldConfig) => {
        setEditingField({ ...field });
        setIsFieldModalOpen(true);
    };

    // submit: UPDATE to template and template_tags
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading("SYSTEM: Updating_Module...");

        try {
            const { error: updateError } = await supabase
                .from('templates')
                .update({
                    title: formData.title,
                    description: formData.description,
                    html_blueprint: formData.html_blueprint,
                    fields_config: fields,
                    preview_url: formData.preview_url,
                    is_personal: formData.is_personal,
                    password: formData.is_personal ? formData.password : null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', templateId);

            if (updateError) throw updateError;

            await supabase.from('template_tags').delete().eq('template_id', templateId);
            
            if (selectedTags.length > 0) {
                const tagEntries = selectedTags.map(tagId => ({
                    template_id: templateId,
                    tags_id: tagId
                }));
                const { error: tagError } = await supabase.from('template_tags').insert(tagEntries);
                if (tagError) throw tagError;
            }

            localStorage.removeItem(STORAGE_KEY);

            toast.success("PROTOCOL_SUCCESS: MODULE_UPDATED", { id: toastId });
            
            router.push(`/?group=category&tag=all`);
            router.refresh();

        } catch (error: any) {
            toast.error(`CRITICAL_ERROR: ${error.message}`, { id: toastId });
        }
    };

    // onclick clear draft button
    const handleClearDraft = () => {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs path={breadcrumbPath} currentFile={formData.title} editorMode="EDIT" />
                    <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                        <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                        <span className="lg:hidden">&lt; BACK</span>
                    </button>
                </div>

                <div className="flex-1 lg:flex overflow-y-auto lg:overflow-hidden px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex-1 flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Fetching_Stored_Data...
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs path={breadcrumbPath} currentFile={formData.title} editorMode="EDIT" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
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
                                    flex flex-wrap gap-2 p-2 border border-(--primary)/50 bg-black/20 transition-all duration-300 scrollbar-hide
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
                                    placeholder='<div class="card">{{content}}</div>'
                                    className="font-Google-Code bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300 scrollbar-hide-resize-y"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData(prev => ({ ...prev, html_blueprint: val }));
                                    }}
                                    value={formData.html_blueprint} 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Fields */}
                    <div className="flex flex-col h-full overflow-hidden border border-(--primary) bg-(--background) text-(--foreground) p-4">
                        <div className="bg-(--background) pb-4 z-5">
                            <div className="flex justify-between items-center border-b border-(--primary)/75 pb-2">
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
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
                                    <SortableContext items={Object.keys(nestedData)} strategy={verticalListSortingStrategy}>
                                        <div className="flex flex-col">
                                            {Object.entries(nestedData).map(([blockName, groups]) => (
                                                <TemplateBlockContainer 
                                                    key={blockName}
                                                    blockName={blockName}
                                                    groups={groups}
                                                    sensors={sensors}
                                                    onFieldDragEnd={handleFieldDragEnd}
                                                    onGroupDragEnd={handleGroupDragEnd}
                                                    onEdit={handleOpenEdit}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </div>
                </form>
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