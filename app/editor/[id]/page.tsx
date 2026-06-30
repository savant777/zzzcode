"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { FieldConfig, defaultGradientValue, generateFinalHTML, getSelectDefaultValue, getSelectOptions, normalizeFieldConfig } from '@/lib/template-parser';

import Modal from '@/components/Modal';
import Breadcrumbs from '@/components/Breadcrumbs';
import FieldRenderer from '@/components/FieldRenderer';
import LivePreview from '@/components/LivePreview';

type GroupedFields = Record<string, FieldConfig[]>;
type HistoryUpdater<T> = T | ((previous: T) => T);
type EditorDraft = {
    id: string;
    name: string;
    fieldValues: Record<string, any>;
    updatedAt: string;
};
type BlockLayout = {
    blockName: string;
    fields: FieldConfig[];
    groups: GroupedFields;
    childBlocks: BlockLayout[];
};

const HISTORY_LIMIT = 50;
const HISTORY_DELAY = 700;

const createDraftId = () => `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEditorDraft = (name: string, fieldValues: Record<string, any>): EditorDraft => ({
    id: createDraftId(),
    name,
    fieldValues,
    updatedAt: new Date().toISOString(),
});

const normalizeDraftName = (name: string | undefined, index: number) => {
    const fallbackName = `Draft ${index + 1}`;
    if (!name) return fallbackName;

    const legacyCharacterName = name.match(/^Character\s+(\d+)$/i);
    return legacyCharacterName ? `Draft ${legacyCharacterName[1]}` : name;
};

const useUndoableState = <T,>(initialValue: T) => {
    const [value, setValueState] = useState<T>(initialValue);
    const [past, setPast] = useState<T[]>([]);
    const [future, setFuture] = useState<T[]>([]);
    const valueRef = useRef(value);
    const pendingSnapshotRef = useRef<T | null>(null);
    const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    const clearHistoryTimer = useCallback(() => {
        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }
    }, []);

    const pushPast = useCallback((snapshot: T) => {
        setPast(prev => {
            if (prev[prev.length - 1] === snapshot) return prev;
            return [...prev.slice(Math.max(0, prev.length - HISTORY_LIMIT + 1)), snapshot];
        });
    }, []);

    const commitPending = useCallback(() => {
        if (pendingSnapshotRef.current === null) return;

        const snapshot = pendingSnapshotRef.current;
        pendingSnapshotRef.current = null;
        if (snapshot !== valueRef.current) {
            pushPast(snapshot);
        }
    }, [pushPast]);

    const setValue = useCallback((updater: HistoryUpdater<T>) => {
        setValueState(prev => {
            if (pendingSnapshotRef.current === null) {
                pendingSnapshotRef.current = prev;
            }

            return typeof updater === 'function'
                ? (updater as (previous: T) => T)(prev)
                : updater;
        });

        setFuture([]);
        clearHistoryTimer();
        historyTimerRef.current = setTimeout(commitPending, HISTORY_DELAY);
    }, [clearHistoryTimer, commitPending]);

    const reset = useCallback((nextValue: T) => {
        clearHistoryTimer();
        pendingSnapshotRef.current = null;
        setPast([]);
        setFuture([]);
        setValueState(nextValue);
    }, [clearHistoryTimer]);

    const undo = useCallback(() => {
        clearHistoryTimer();

        if (pendingSnapshotRef.current !== null) {
            const snapshot = pendingSnapshotRef.current;
            pendingSnapshotRef.current = null;
            setFuture(prev => [valueRef.current, ...prev]);
            setValueState(snapshot);
            return;
        }

        setPast(prev => {
            const snapshot = prev[prev.length - 1];
            if (!snapshot) return prev;

            setFuture(nextFuture => [valueRef.current, ...nextFuture]);
            setValueState(snapshot);
            return prev.slice(0, -1);
        });
    }, [clearHistoryTimer]);

    const redo = useCallback(() => {
        clearHistoryTimer();
        pendingSnapshotRef.current = null;

        setFuture(prev => {
            const snapshot = prev[0];
            if (!snapshot) return prev;

            setPast(nextPast => [...nextPast.slice(Math.max(0, nextPast.length - HISTORY_LIMIT + 1)), valueRef.current]);
            setValueState(snapshot);
            return prev.slice(1);
        });
    }, [clearHistoryTimer]);

    useEffect(() => () => clearHistoryTimer(), [clearHistoryTimer]);

    return {
        value,
        setValue,
        reset,
        undo,
        redo,
        canUndo: pendingSnapshotRef.current !== null || past.length > 0,
        canRedo: future.length > 0,
    };
};

const groupFieldList = (fieldList: FieldConfig[]): GroupedFields => {
    const groups: GroupedFields = {};

    fieldList.forEach(f => {
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
        }, {} as GroupedFields);
};

const getDefaultValue = (field: FieldConfig) => {
    if (field.type === 'slider') {
        return field.config?.sliders?.map(s => s.default_value) || field.default_value;
    }

    if (field.type === 'gradient') {
        return field.config?.gradient || defaultGradientValue;
    }

    if (field.type === 'checkbox') {
        const trueValue = field.config?.true_value || 'true';
        const falseValue = field.config?.false_value || 'false';

        return field.default_value === trueValue ? trueValue : falseValue;
    }

    if (field.type === 'select') {
        const defaultValue = getSelectDefaultValue(field);
        const defaultOption = getSelectOptions(field).find(opt => opt.value === defaultValue);
        const defaultEntry = (entry: Record<string, any>) => field.config?.select_multiple
            ? { multiple: true, selected: [entry] }
            : entry;

        if (defaultOption?.type === 'slider') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: field.config?.sliders?.map(s => s.default_value) || [0],
            });
        }

        if (defaultOption?.type === 'gradient') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: field.config?.gradient || defaultGradientValue,
            });
        }

        if (defaultOption?.type === 'color') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: defaultOption.default_value || '#FFFFFF',
            });
        }

        if (defaultOption?.type === 'text' || defaultOption?.type === 'bbcode') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: defaultOption.default_value || '',
            });
        }

        if (field.config?.select_multiple) {
            return { multiple: true, selected: [{ option_index: 0, value: defaultValue }] };
        }

        return defaultValue;
    }

    return field.default_value;
};

const createBlockEntry = (
    blockFields: FieldConfig[],
    source?: Record<string, any>,
    childBlockMap: Record<string, FieldConfig[]> = {},
    fallbackBlockValues?: Record<string, any>
) => {
    const entry: Record<string, any> = {};

    blockFields.forEach(field => {
        entry[field.variable_name] = source?.[field.variable_name] ?? getDefaultValue(field);
    });

    Object.entries(childBlockMap).forEach(([childBlockName, childFields]) => {
        const savedChildBlock = source?.[childBlockName] ?? fallbackBlockValues?.[childBlockName];

        if (Array.isArray(savedChildBlock)) {
            entry[childBlockName] = savedChildBlock.map(childEntry => createBlockEntry(childFields, childEntry));
        } else {
            entry[childBlockName] = [createBlockEntry(childFields)];
        }
    });

    return entry;
};

const buildInitialValues = (fieldList: FieldConfig[], savedValues?: Record<string, any>) => {
    const values: Record<string, any> = {};
    const blockBuckets: Record<string, FieldConfig[]> = {};
    const childBlockBuckets: Record<string, Record<string, FieldConfig[]>> = {};

    fieldList.forEach(field => {
        if (field.block_name && field.parent_block_name) {
            if (!childBlockBuckets[field.parent_block_name]) childBlockBuckets[field.parent_block_name] = {};
            if (!childBlockBuckets[field.parent_block_name][field.block_name]) childBlockBuckets[field.parent_block_name][field.block_name] = [];
            childBlockBuckets[field.parent_block_name][field.block_name].push(field);
        } else if (field.block_name) {
            if (!blockBuckets[field.block_name]) blockBuckets[field.block_name] = [];
            blockBuckets[field.block_name].push(field);
        } else {
            values[field.variable_name] = savedValues?.[field.variable_name] ?? getDefaultValue(field);
        }
    });

    Object.entries(blockBuckets).forEach(([blockName, blockFields]) => {
        const savedBlock = savedValues?.[blockName];
        const childBlocks = childBlockBuckets[blockName] || {};

        if (Array.isArray(savedBlock)) {
            values[blockName] = savedBlock.map(entry => createBlockEntry(blockFields, entry, childBlocks, savedValues));
        } else {
            values[blockName] = [createBlockEntry(blockFields, savedValues, childBlocks, savedValues)];
        }
    });

    return values;
};

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
    const [modalType, setModalType] = useState<'clear_draft' | 'clear_current_draft' | 'delete_draft' | 'rename_draft' | null>(null);
    const [loading, setLoading] = useState(true);
    const [renameDraftName, setRenameDraftName] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        supports_multiple_drafts: false,
        html_blueprint: '',
    });

    const [fields, setFields] = useState<FieldConfig[]>([]);
    const [drafts, setDrafts] = useState<EditorDraft[]>([]);
    const [activeDraftId, setActiveDraftId] = useState('');
    const {
        value: fieldValues,
        setValue: setFieldValues,
        reset: resetFieldValues,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useUndoableState<Record<string, any>>({});

    const activeDraft = useMemo(
        () => drafts.find(draft => draft.id === activeDraftId),
        [drafts, activeDraftId]
    );

    // --- 2. Computed Preview ---
    const liveHTML = useMemo(() => {
        if (!formData.html_blueprint) return "";
        return generateFinalHTML(formData.html_blueprint, fieldValues, fields, true);
    }, [formData.html_blueprint, fieldValues, fields]);

    // Grouping Field
    const fieldLayout = useMemo(() => {
        const globalFields = fields.filter(field => !field.block_name);
        const blockBuckets: Record<string, FieldConfig[]> = {};
        const childBlockBuckets: Record<string, Record<string, FieldConfig[]>> = {};

        fields.forEach(field => {
            if (!field.block_name) return;

            if (field.parent_block_name) {
                if (!childBlockBuckets[field.parent_block_name]) childBlockBuckets[field.parent_block_name] = {};
                if (!childBlockBuckets[field.parent_block_name][field.block_name]) childBlockBuckets[field.parent_block_name][field.block_name] = [];
                childBlockBuckets[field.parent_block_name][field.block_name].push(field);
                return;
            }

            if (!blockBuckets[field.block_name]) blockBuckets[field.block_name] = [];
            blockBuckets[field.block_name].push(field);
        });

        const blocks = Object.entries(blockBuckets)
            .sort(([, a], [, b]) => (a[0]?.block_order ?? 0) - (b[0]?.block_order ?? 0))
            .map(([blockName, blockFields]) => ({
                blockName,
                fields: blockFields,
                groups: groupFieldList(blockFields),
                childBlocks: Object.entries(childBlockBuckets[blockName] || {})
                    .sort(([, a], [, b]) => (a[0]?.block_order ?? 0) - (b[0]?.block_order ?? 0))
                    .map(([childBlockName, childFields]) => ({
                        blockName: childBlockName,
                        fields: childFields,
                        groups: groupFieldList(childFields),
                        childBlocks: [],
                    })),
            } as BlockLayout));

        return {
            globalGroups: groupFieldList(globalFields),
            blocks,
        };
    }, [fields]);

    // --- 3. Effects ---

    useEffect(() => {
        const initEditorPage = async () => {
            setLoading(true);
            if (templateId) {
                const { data: template } = await supabase.from('templates').select('*').eq('id', templateId).single();

                if (template) {
                    if (template.is_personal) {
                        const isUnlocked = sessionStorage.getItem(`unlocked_${templateId}`);
                        if (!isUnlocked) {
                            toast.error("ERROR_ACCESS_DENIED: AUTHENTICATION_REQUIRED", {
                                duration: 4000,
                                style: {
                                    position: 'fixed',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    margin: 0,
                                    zIndex: 9999,
                                    width: 'max-content',
                                    minWidth: '320px',
                                    height: 'fit-content'
                                },
                            });

                            setTimeout(() => {
                                router.replace('/?group=category&tag=all');
                            }, 3000);
                            return;
                        }
                    }

                    const initialData = {
                        title: template.title,
                        description: template.description,
                        supports_multiple_drafts: template.supports_multiple_drafts || false,
                        html_blueprint: template.html_blueprint,
                    };
                    
                    setFormData(initialData);
                    const initialFields = (template.fields_config || []).map(normalizeFieldConfig).sort((a: any, b: any) => {
                        if (a.group_order !== b.group_order) {
                            return (a.group_order ?? 0) - (b.group_order ?? 0);
                        }
                        return (a.field_order ?? 0) - (b.field_order ?? 0);
                    });
                    setFields(initialFields);
                    
                    const defaults = buildInitialValues(initialFields);
                    const initialDraft = createEditorDraft('Draft 1', defaults);
                    setDrafts([initialDraft]);
                    setActiveDraftId(initialDraft.id);
                    resetFieldValues(defaults);

                    // Check Local Draft
                    const savedDraft = localStorage.getItem(STORAGE_KEY);
                    if (savedDraft) {
                        try {
                            const parsed = JSON.parse(savedDraft);
                            if (parsed.templateId === templateId) {
                                setFormData(initialData);
                                const draftFields = initialFields;
                                setFields(draftFields);
                                const migratedDrafts = Array.isArray(parsed.drafts) && parsed.drafts.length > 0
                                    ? parsed.drafts.map((draft: Partial<EditorDraft>, index: number) => ({
                                        id: draft.id || createDraftId(),
                                        name: normalizeDraftName(draft.name, index),
                                        fieldValues: buildInitialValues(draftFields, draft.fieldValues || {}),
                                        updatedAt: draft.updatedAt || new Date().toISOString(),
                                    }))
                                    : [createEditorDraft('Draft 1', buildInitialValues(draftFields, parsed.fieldValues || defaults))];
                                const nextActiveDraftId = migratedDrafts.some((draft: EditorDraft) => draft.id === parsed.activeDraftId)
                                    ? parsed.activeDraftId
                                    : migratedDrafts[0].id;
                                const nextActiveDraft = migratedDrafts.find((draft: EditorDraft) => draft.id === nextActiveDraftId) || migratedDrafts[0];

                                setDrafts(migratedDrafts);
                                setActiveDraftId(nextActiveDraft.id);
                                resetFieldValues(nextActiveDraft.fieldValues);
                            }
                        } catch (e) { console.error(e); }
                    }
                }
            }
            setLoading(false);
        };
        initEditorPage();

        return undefined;
    }, [templateId, router]);

    useEffect(() => {
        if (loading || !activeDraftId) return;

        setDrafts(prev => prev.map(draft => draft.id === activeDraftId
            ? { ...draft, fieldValues, updatedAt: new Date().toISOString() }
            : draft
        ));
    }, [fieldValues, activeDraftId, loading]);

    // Auto-Save Draft
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!loading && (formData.title || formData.html_blueprint)) {
                const nextDrafts = drafts.map(draft => draft.id === activeDraftId
                    ? { ...draft, fieldValues, updatedAt: new Date().toISOString() }
                    : draft
                );

                localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
                    templateId,
                    activeDraftId,
                    drafts: nextDrafts,
                }));
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [formData, fields, drafts, activeDraftId, fieldValues, loading]);

    useEffect(() => {
        const handleHistoryShortcut = (event: KeyboardEvent) => {
            const isModifier = event.ctrlKey || event.metaKey;
            if (!isModifier) return;

            const key = event.key.toLowerCase();
            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
            }

            if (key === 'y' || (key === 'z' && event.shiftKey)) {
                event.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleHistoryShortcut);
        return () => window.removeEventListener('keydown', handleHistoryShortcut);
    }, [undo, redo]);

    // --- 4. Handlers ---
    const syncActiveDraft = (values: Record<string, any> = fieldValues) => {
        if (!activeDraftId) return;

        setDrafts(prev => prev.map(draft => draft.id === activeDraftId
            ? { ...draft, fieldValues: values, updatedAt: new Date().toISOString() }
            : draft
        ));
    };

    const handleSelectDraft = (draftId: string) => {
        const nextDraft = drafts.find(draft => draft.id === draftId);
        if (!nextDraft || nextDraft.id === activeDraftId) return;

        syncActiveDraft();
        setActiveDraftId(nextDraft.id);
        resetFieldValues(buildInitialValues(fields, nextDraft.fieldValues));
    };

    const handleAddDraft = () => {
        const nextDraftNumber = drafts.length + 1;
        const nextDraft = createEditorDraft(`Draft ${nextDraftNumber}`, buildInitialValues(fields));

        syncActiveDraft();
        setDrafts(prev => [...prev, nextDraft]);
        setActiveDraftId(nextDraft.id);
        resetFieldValues(nextDraft.fieldValues);
        toast.success(`DRAFT_CREATED: ${nextDraft.name}`);
    };

    const handleRenameDraft = () => {
        if (!activeDraft) return;

        setRenameDraftName(activeDraft.name);
        setModalType('rename_draft');
    };

    const handleSubmitRenameDraft = (event: React.FormEvent) => {
        event.preventDefault();
        if (!activeDraft) return;

        const nextName = renameDraftName.trim();
        if (!nextName) return;

        setDrafts(prev => prev.map(draft => draft.id === activeDraft.id
            ? { ...draft, name: nextName, updatedAt: new Date().toISOString() }
            : draft
        ));
        setModalType(null);
    };

    const handleDeleteDraft = () => {
        if (!activeDraft || drafts.length <= 1) return;
        setModalType('delete_draft');
    };

    const handleConfirmDeleteDraft = () => {
        if (!activeDraft || drafts.length <= 1) return;

        const nextDrafts = drafts.filter(draft => draft.id !== activeDraft.id);
        const nextDraft = nextDrafts[0];

        setDrafts(nextDrafts);
        setActiveDraftId(nextDraft.id);
        resetFieldValues(buildInitialValues(fields, nextDraft.fieldValues));
        setModalType(null);
        toast.success(`DRAFT_DELETED: ${activeDraft.name}`);
    };

    const handleValueChange = (varName: string, value: any) => {
        setFieldValues(prev => ({ ...prev, [varName]: value }));
    };

    const getBlockFields = (blockName: string, parentBlockName?: string) => fields.filter(field =>
        field.block_name === blockName &&
        field.parent_block_name === parentBlockName
    );

    const getChildBlockFieldsMap = (parentBlockName: string) => {
        return fields
            .filter(field => field.parent_block_name === parentBlockName && field.block_name)
            .reduce((acc, field) => {
                const childBlockName = field.block_name as string;
                if (!acc[childBlockName]) acc[childBlockName] = [];
                acc[childBlockName].push(field);
                return acc;
            }, {} as Record<string, FieldConfig[]>);
    };

    const handleBlockValueChange = (blockName: string, entryIndex: number, varName: string, value: any) => {
        setFieldValues(prev => {
            const blockFields = getBlockFields(blockName);
            const childBlocks = getChildBlockFieldsMap(blockName);
            const entries = Array.isArray(prev[blockName]) && prev[blockName].length > 0
                ? [...prev[blockName]]
                : [createBlockEntry(blockFields, undefined, childBlocks)];

            entries[entryIndex] = {
                ...createBlockEntry(blockFields, entries[entryIndex], childBlocks),
                ...entries[entryIndex],
                [varName]: value,
            };

            return { ...prev, [blockName]: entries };
        });
    };

    const handleNestedBlockValueChange = (parentBlockName: string, parentEntryIndex: number, childBlockName: string, childEntryIndex: number, varName: string, value: any) => {
        setFieldValues(prev => {
            const parentFields = getBlockFields(parentBlockName);
            const childFields = getBlockFields(childBlockName, parentBlockName);
            const parentEntries = Array.isArray(prev[parentBlockName]) && prev[parentBlockName].length > 0
                ? [...prev[parentBlockName]]
                : [createBlockEntry(parentFields)];
            const parentEntry = { ...createBlockEntry(parentFields, parentEntries[parentEntryIndex]), ...parentEntries[parentEntryIndex] };
            const childEntries = Array.isArray(parentEntry[childBlockName]) && parentEntry[childBlockName].length > 0
                ? [...parentEntry[childBlockName]]
                : [createBlockEntry(childFields)];

            childEntries[childEntryIndex] = {
                ...createBlockEntry(childFields, childEntries[childEntryIndex]),
                [varName]: value,
            };
            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: childEntries,
            };

            return { ...prev, [parentBlockName]: parentEntries };
        });
    };

    const handleAddBlockEntry = (blockName: string) => {
        setFieldValues(prev => {
            const blockFields = getBlockFields(blockName);
            const childBlocks = getChildBlockFieldsMap(blockName);
            const entries = Array.isArray(prev[blockName]) ? prev[blockName] : [];

            return {
                ...prev,
                [blockName]: [...entries, createBlockEntry(blockFields, undefined, childBlocks)],
            };
        });
    };

    const handleRemoveBlockEntry = (blockName: string, entryIndex: number) => {
        setFieldValues(prev => {
            const entries = Array.isArray(prev[blockName]) && prev[blockName].length > 0
                ? [...prev[blockName]]
                : [];

            entries.splice(entryIndex, 1);

            return { ...prev, [blockName]: entries };
        });
    };

    const handleAddNestedBlockEntry = (parentBlockName: string, parentEntryIndex: number, childBlockName: string) => {
        setFieldValues(prev => {
            const parentFields = getBlockFields(parentBlockName);
            const childFields = getBlockFields(childBlockName, parentBlockName);
            const parentEntries = Array.isArray(prev[parentBlockName]) && prev[parentBlockName].length > 0
                ? [...prev[parentBlockName]]
                : [createBlockEntry(parentFields)];
            const parentEntry = { ...createBlockEntry(parentFields, parentEntries[parentEntryIndex]), ...parentEntries[parentEntryIndex] };
            const childEntries = Array.isArray(parentEntry[childBlockName]) ? parentEntry[childBlockName] : [];

            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: [...childEntries, createBlockEntry(childFields)],
            };

            return { ...prev, [parentBlockName]: parentEntries };
        });
    };

    const handleRemoveNestedBlockEntry = (parentBlockName: string, parentEntryIndex: number, childBlockName: string, childEntryIndex: number) => {
        setFieldValues(prev => {
            const parentFields = getBlockFields(parentBlockName);
            const parentEntries = Array.isArray(prev[parentBlockName]) && prev[parentBlockName].length > 0
                ? [...prev[parentBlockName]]
                : [createBlockEntry(parentFields)];
            const parentEntry = { ...createBlockEntry(parentFields, parentEntries[parentEntryIndex]), ...parentEntries[parentEntryIndex] };
            const childEntries = Array.isArray(parentEntry[childBlockName]) && parentEntry[childBlockName].length > 0
                ? [...parentEntry[childBlockName]]
                : [];

            childEntries.splice(childEntryIndex, 1);
            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: childEntries,
            };

            return { ...prev, [parentBlockName]: parentEntries };
        });
    };

    const handleClearDraft = () => {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    };

    const handleClearCurrentDraft = () => {
        if (!activeDraft) return;

        const defaults = buildInitialValues(fields);
        resetFieldValues(defaults);
        setDrafts(prev => prev.map(draft => draft.id === activeDraft.id
            ? { ...draft, fieldValues: defaults, updatedAt: new Date().toISOString() }
            : draft
        ));
        setModalType(null);
        toast.success(`DRAFT_CLEARED: ${activeDraft.name}`);
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

    if (loading) {
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
                                        disabled={!canUndo}
                                        onClick={undo}
                                        className="border border-(--primary)/30 px-2 py-0.5 text-[10px] uppercase text-(--primary) hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25 cursor-pointer transition-colors"
                                        title="Undo (Ctrl+Z)"
                                    >
                                        Undo
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canRedo}
                                        onClick={redo}
                                        className="border border-(--primary)/30 px-2 py-0.5 text-[10px] uppercase text-(--primary) hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25 cursor-pointer transition-colors"
                                        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                                    >
                                        Redo
                                    </button>
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
                            {formData.supports_multiple_drafts && (
                            <div className="border border-(--primary)/30 bg-black/20 p-3">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2 border-b border-(--primary)/20 pb-2">
                                        <div className="min-w-0">
                                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-(--primary)">
                                                Template_Drafts
                                            </h4>
                                            <p className="text-[10px] uppercase text-(--foreground)/35 truncate">
                                                {activeDraft ? `Editing: ${activeDraft.name}` : 'No active draft'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddDraft}
                                            className="cursor-pointer bg-(--primary) px-3 py-1 text-[10px] font-black uppercase text-(--background) transition-all hover:brightness-110"
                                        >
                                            Add_Draft
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                                        <div className="relative min-w-0">
                                            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-(--primary)">
                                                <svg width="12" height="12" viewBox="0 0 524 524" fill="currentColor">
                                                    <path d="M64 191L98 157 262 320 426 157 460 191 262 387 64 191Z"/>
                                                </svg>
                                            </div>
                                            <select
                                                value={activeDraftId}
                                                onChange={(event) => handleSelectDraft(event.target.value)}
                                                className="w-full cursor-pointer appearance-none border border-(--primary)/50 bg-black/20 p-2 pr-6 font-Google-Sans text-sm text-(--primary) outline-none transition-all duration-300 focus:border-(--primary)/75"
                                            >
                                                {drafts.map((draft, index) => (
                                                    <option key={draft.id} value={draft.id} className="bg-black">
                                                        {draft.name || `Draft ${index + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={!activeDraft}
                                            onClick={handleRenameDraft}
                                            className="cursor-pointer border border-(--primary)/30 px-3 py-2 text-[10px] font-black uppercase text-(--primary) transition-colors hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25"
                                        >
                                            Rename
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!activeDraft}
                                            onClick={() => setModalType('clear_current_draft')}
                                            className="cursor-pointer border border-amber-400/30 px-3 py-2 text-[10px] font-black uppercase text-amber-200 transition-colors hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-25"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            type="button"
                                            disabled={drafts.length <= 1}
                                            onClick={handleDeleteDraft}
                                            className="cursor-pointer border border-red-500/30 px-3 py-2 text-[10px] font-black uppercase text-red-300 transition-colors hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-25"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                            )}

                            {Object.entries(fieldLayout.globalGroups).map(([groupName, groupFields]) => {
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
                                                const isWide = field.type === "bbcode" || (totalFields % 2 !== 0 && index === 0);

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

                            {fieldLayout.blocks.map(({ blockName, groups, fields: blockFields, childBlocks }) => {
                                const entries = Array.isArray(fieldValues[blockName])
                                    ? fieldValues[blockName]
                                    : [];
                                const blockDescription = blockFields.find(field => field.block_description)?.block_description;

                                return (
                                    <div key={blockName} className="border border-dashed border-(--primary)/40 p-3">
                                        <div className="flex items-center gap-2 border-b border-(--primary)/30 pb-2 mb-3">
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-(--primary) truncate">
                                                    BLOCK_SCOPE: {blockName}
                                                </h4>
                                                <p className="text-[10px] uppercase text-(--foreground)/35">
                                                    {entries.length} item{entries.length === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAddBlockEntry(blockName)}
                                                className="ml-auto cursor-pointer bg-(--primary) text-(--background) px-3 py-1 text-[10px] font-black uppercase hover:brightness-110 transition-all"
                                            >
                                                Add
                                            </button>
                                        </div>

                                        {blockDescription && (
                                            <p className="mb-3 font-Google-Sans text-xs leading-relaxed whitespace-pre-wrap text-(--foreground)/70">
                                                {blockDescription}
                                            </p>
                                        )}

                                        <div className="flex flex-col gap-4">
                                            {entries.length === 0 && (
                                                <div className="border border-dashed border-(--primary)/20 bg-black/10 p-4 text-center text-[10px] uppercase tracking-[0.2em] text-(--foreground)/30">
                                                    No_Block_Items
                                                </div>
                                            )}
                                            {entries.map((entryValues: Record<string, any>, entryIndex: number) => (
                                                <div key={`${blockName}-${entryIndex}`} className="border border-(--primary)/20 bg-black/20 p-3">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--foreground)/50">
                                                            #{entryIndex + 1}
                                                        </span>
                                                        <div className="ml-auto flex gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveBlockEntry(blockName, entryIndex)}
                                                                className="cursor-pointer border border-red-500/30 px-2 py-1 text-[10px] uppercase text-red-300 hover:border-red-500 transition-colors"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-5">
                                                        {Object.entries(groups).map(([groupName, groupFields]) => {
                                                            const totalFields = groupFields.length;

                                                            return (
                                                                <div key={`${blockName}-${entryIndex}-${groupName}`}>
                                                                    <div className="flex items-center gap-2 px-2 py-1 bg-(--primary)/5 border-l-2 border-(--primary) mb-2 select-none">
                                                                        <h5 className="text-xs font-bold uppercase tracking-[0.2em] text-(--primary)">
                                                                            {groupName}
                                                                        </h5>
                                                                    </div>

                                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                        {groupFields.map((field, index) => {
                                                                            const isWide = field.type === "bbcode" || (totalFields % 2 !== 0 && index === 0);

                                                                            return (
                                                                                <FieldRenderer
                                                                                    key={`${field.id}-${entryIndex}`}
                                                                                    field={field}
                                                                                    value={entryValues[field.variable_name]}
                                                                                    onChange={(varName, value) => handleBlockValueChange(blockName, entryIndex, varName, value)}
                                                                                    className={isWide ? "lg:col-span-2" : "col-span-1"}
                                                                                />
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}

                                                        {childBlocks.map((childBlock) => {
                                                            const childEntries = Array.isArray(entryValues[childBlock.blockName])
                                                                ? entryValues[childBlock.blockName]
                                                                : [];
                                                            const childDescription = childBlock.fields.find(field => field.block_description)?.block_description;

                                                            return (
                                                                <div key={`${blockName}-${entryIndex}-${childBlock.blockName}`} className="border border-dashed border-(--primary)/30 bg-black/20 p-3">
                                                                    <div className="flex items-center gap-2 border-b border-(--primary)/20 pb-2 mb-3">
                                                                        <div className="min-w-0">
                                                                            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-(--primary)/80 truncate">
                                                                                NESTED_BLOCK: {childBlock.blockName}
                                                                            </h5>
                                                                            <p className="text-[10px] uppercase text-(--foreground)/30">
                                                                                {childEntries.length} item{childEntries.length === 1 ? '' : 's'}
                                                                            </p>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAddNestedBlockEntry(blockName, entryIndex, childBlock.blockName)}
                                                                            className="ml-auto cursor-pointer border border-(--primary)/40 px-3 py-1 text-[10px] font-black uppercase text-(--primary) hover:border-(--primary) transition-colors"
                                                                        >
                                                                            Add
                                                                        </button>
                                                                    </div>

                                                                    {childDescription && (
                                                                        <p className="mb-3 font-Google-Sans text-xs leading-relaxed whitespace-pre-wrap text-(--foreground)/60">
                                                                            {childDescription}
                                                                        </p>
                                                                    )}

                                                                    <div className="flex flex-col gap-3">
                                                                        {childEntries.length === 0 && (
                                                                            <div className="border border-dashed border-(--primary)/15 bg-black/10 p-3 text-center text-[10px] uppercase tracking-[0.2em] text-(--foreground)/25">
                                                                                No_Nested_Block_Items
                                                                            </div>
                                                                        )}
                                                                        {childEntries.map((childEntryValues: Record<string, any>, childEntryIndex: number) => (
                                                                            <div key={`${blockName}-${entryIndex}-${childBlock.blockName}-${childEntryIndex}`} className="border border-(--primary)/15 bg-black/20 p-3">
                                                                                <div className="mb-3 flex items-center gap-2">
                                                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--foreground)/45">
                                                                                        #{childEntryIndex + 1}
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleRemoveNestedBlockEntry(blockName, entryIndex, childBlock.blockName, childEntryIndex)}
                                                                                        className="ml-auto cursor-pointer border border-red-500/25 px-2 py-1 text-[10px] uppercase text-red-300 hover:border-red-500 transition-colors"
                                                                                    >
                                                                                        Remove
                                                                                    </button>
                                                                                </div>

                                                                                <div className="flex flex-col gap-5">
                                                                                    {Object.entries(childBlock.groups).map(([childGroupName, childGroupFields]) => {
                                                                                        const totalChildFields = childGroupFields.length;

                                                                                        return (
                                                                                            <div key={`${blockName}-${entryIndex}-${childBlock.blockName}-${childEntryIndex}-${childGroupName}`}>
                                                                                                <div className="flex items-center gap-2 px-2 py-1 bg-(--primary)/5 border-l-2 border-(--primary)/70 mb-2 select-none">
                                                                                                    <h6 className="text-xs font-bold uppercase tracking-[0.2em] text-(--primary)/80">
                                                                                                        {childGroupName}
                                                                                                    </h6>
                                                                                                </div>

                                                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                                                    {childGroupFields.map((field, index) => {
                                                                                                        const isWide = field.type === "bbcode" || (totalChildFields % 2 !== 0 && index === 0);

                                                                                                        return (
                                                                                                            <FieldRenderer
                                                                                                                key={`${field.id}-${entryIndex}-${childEntryIndex}`}
                                                                                                                field={field}
                                                                                                                value={childEntryValues[field.variable_name]}
                                                                                                                onChange={(varName, value) => handleNestedBlockValueChange(blockName, entryIndex, childBlock.blockName, childEntryIndex, varName, value)}
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
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
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
                            <LivePreview html={liveHTML} />
                        </div>
                    </div>
                </div>
            </div>

            <Modal 
                isOpen={modalType !== null} 
                onClose={() => setModalType(null)} 
                title={modalType === 'clear_draft' ? 'Clear All Drafts' : modalType === 'clear_current_draft' ? 'Clear Current Draft' : modalType === 'delete_draft' ? 'Delete Draft' : modalType === 'rename_draft' ? 'Rename Draft' : ''}
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
                {modalType === 'clear_current_draft' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-amber-300 mb-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            <span className="text-xs uppercase font-black tracking-[0.2em]">Clear_Current_Draft</span>
                        </div>

                        <div className="space-y-2">
                            <p className="text-white/60 text-xs leading-relaxed">
                                คุณแน่ใจหรือไม่ที่จะล้างข้อมูล <span className="text-amber-200 font-bold">{activeDraft?.name || 'ดราฟต์นี้'}</span> ?
                            </p>
                            <p className="text-[10px] text-white/40 uppercase leading-tight">
                                Other template drafts in the dropdown will stay unchanged.
                            </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setModalType(null)}
                                className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleClearCurrentDraft}
                                className="cursor-pointer flex-1 py-2 bg-amber-400 text-black font-bold uppercase text-xs hover:bg-amber-300 transition-all"
                            >
                                Clear_This
                            </button>
                        </div>
                    </div>
                )}
                {modalType === 'delete_draft' && (
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
                                คุณแน่ใจหรือไม่ที่จะลบ <span className="text-red-400 font-bold">{activeDraft?.name || 'ดราฟต์นี้'}</span> ?
                            </p>
                            <p className="text-[10px] text-white/40 uppercase leading-tight">
                                Warning: This draft will be removed from the dropdown. Other template drafts will stay unchanged.
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
                                onClick={handleConfirmDeleteDraft}
                                className="cursor-pointer flex-1 py-2 bg-red-600 text-white font-bold uppercase text-xs hover:bg-red-500 transition-all"
                            >
                                Confirm_Delete
                            </button>
                        </div>
                    </div>
                )}
                {modalType === 'rename_draft' && (
                    <form onSubmit={handleSubmitRenameDraft} className="space-y-5">
                        <div className="flex flex-col gap-1">
                            <label className="text-sm uppercase opacity-70">Draft_Name</label>
                            <input
                                autoFocus
                                type="text"
                                value={renameDraftName}
                                onChange={(event) => setRenameDraftName(event.target.value)}
                                className="font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75 transition-all duration-300"
                                placeholder="Draft 1"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setModalType(null)}
                                className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!renameDraftName.trim()}
                                className="cursor-pointer flex-1 py-2 bg-(--primary) text-(--background) font-bold uppercase text-xs hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 transition-all"
                            >
                                Save_Name
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}
