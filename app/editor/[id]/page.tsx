"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { FieldConfig, generateFinalHTML, normalizeFieldConfig } from '@/lib/template-parser';

import Modal from '@/components/Modal';
import Breadcrumbs from '@/components/Breadcrumbs';
import { templateRoute } from '@/lib/template-tags';
import { getRememberedTemplateUnlock } from '@/lib/template-unlock';
import { getDefaultValue } from '@/lib/field-defaults';
import { defaultBlockCount } from '@/lib/block-defaults';
import { BBCODE_HEIGHTS, getBBCodeHeights, updateBBCodeHeight } from '@/lib/bbcode-height';
import FieldRenderer from '@/components/FieldRenderer';
import LivePreview from '@/components/LivePreview';
import { localCopyKey, readLocalCopy, saveLocalCopy, type LocalDraftCopy } from '@/lib/editor-local-copy';
import { backupLink, backupOpenAction, BackupRequestError, createBackup, loadBackup, parseBackupLink, persistConnection, readConnection, sameBackupContent, updateBackup, type BackupConnection, type BackupPayload } from '@/lib/editor-backup-client';

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

const cloneFieldValues = (values: Record<string, any>) => {
    if (typeof structuredClone === 'function') return structuredClone(values);
    return JSON.parse(JSON.stringify(values));
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

const createBlockEntry = (
    blockFields: FieldConfig[],
    source?: Record<string, any>,
    childBlockMap: Record<string, FieldConfig[]> = {},
    fallbackBlockValues?: Record<string, any>,
    initialIndex?: number
) => {
    const entry: Record<string, any> = { [BBCODE_HEIGHTS]: getBBCodeHeights(source) };

    blockFields.forEach(field => {
        const overrides = field.block_default_values;
        const initial = initialIndex !== undefined && overrides && Object.prototype.hasOwnProperty.call(overrides, initialIndex)
            ? overrides[initialIndex] : getDefaultValue(field);
        entry[field.variable_name] = structuredClone(source?.[field.variable_name] ?? initial);
    });

    Object.entries(childBlockMap).forEach(([childBlockName, childFields]) => {
        const savedChildBlock = source?.[childBlockName] ?? fallbackBlockValues?.[childBlockName];

        if (Array.isArray(savedChildBlock)) {
            entry[childBlockName] = savedChildBlock.map(childEntry => createBlockEntry(childFields, childEntry));
        } else {
            entry[childBlockName] = Array.from({ length: defaultBlockCount(childFields) }, (_, index) => createBlockEntry(childFields, undefined, {}, undefined, index));
        }
    });

    return entry;
};

const buildInitialValues = (fieldList: FieldConfig[], savedValues?: Record<string, any>) => {
    const values: Record<string, any> = { [BBCODE_HEIGHTS]: getBBCodeHeights(savedValues) };
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
            values[blockName] = Array.from({ length: defaultBlockCount(blockFields) }, (_, index) => createBlockEntry(blockFields, savedValues, childBlocks, savedValues, index));
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
    const [breadcrumbTags, setBreadcrumbTags] = useState<any[]>([]);
    const breadcrumbRoute = templateRoute(breadcrumbTags, `${fromGroup}:${fromTag}`);
    const breadcrumbPath = `${breadcrumbRoute.group}:${breadcrumbRoute.tag}`;

    // --- 1. States ---
    const [modalType, setModalType] = useState<'clear_draft' | 'clear_current_draft' | 'delete_draft' | 'rename_draft' | 'backup_link' | 'backup_conflict' | 'backup_open' | 'backup_unavailable' | null>(null);
    const [pendingRemoteBackup, setPendingRemoteBackup] = useState<BackupConnection | null>(null);
    const [localCopiesOpen, setLocalCopiesOpen] = useState(false);
    const [localCopy, setLocalCopy] = useState<LocalDraftCopy | null>(null);
    const previewLocalCopyTime = localCopy?.templateId === String(templateId)
        ? new Date(localCopy.savedAt).toLocaleString('en-GB', { hour12: false }) : null;
    const [previewBackupLink, setPreviewBackupLink] = useState('');
    const [backupConnection, setBackupConnection] = useState<BackupConnection | null>(null);
    const [backupSaving, setBackupSaving] = useState(false);
    const [backupFailed, setBackupFailed] = useState(false);
    const [backupReady, setBackupReady] = useState(false);
    const [conflictRevision, setConflictRevision] = useState<number | null>(null);
    const backupBusyRef = useRef(false);
    const templateAccessRef = useRef<{ fingerprint?: string; backup?: { id: string; token: string } }>({});
    const currentTemplateRef = useRef(templateId);
    currentTemplateRef.current = templateId;
    const [backupLinkCopied, setBackupLinkCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
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
    const removedBlockEntryCacheRef = useRef<Record<string, Record<string, any>>>({});

    const currentBackupPayload = useMemo<BackupPayload>(() => ({
        activeDraftId,
        drafts: drafts.map(draft => draft.id === activeDraftId ? { ...draft, fieldValues } : draft),
    }), [drafts, activeDraftId, fieldValues]);
    const currentBackupPayloadRef = useRef(currentBackupPayload);
    currentBackupPayloadRef.current = currentBackupPayload;
    const backupStatus = backupSaving ? 'Saving…' : backupFailed ? 'Save failed' : backupConnection
        ? `Saved: ${new Date(backupConnection.updatedAt).toLocaleString('en-GB', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}${sameBackupContent(currentBackupPayload, backupConnection.savedPayload) ? '' : ' · Unsaved changes'}`
        : 'Local only';

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
        currentTemplateRef.current = templateId;
        setLocalCopiesOpen(false);
        setModalType(null);
        setBackupReady(false);
        setBackupConnection(null);
        setPreviewBackupLink('');
        setBackupFailed(false);
        setConflictRevision(null);
        try {
            const connection = readConnection(localStorage, String(templateId));
            setBackupConnection(connection);
            setPreviewBackupLink(connection ? backupLink(window.location.origin, connection) : '');
            setLocalCopy(readLocalCopy(localStorage, String(templateId), connection?.id || null));
            setBackupReady(true);
        } catch {
            setLocalCopy(null);
            toast.error('CRITICAL_ERROR: Failed to read backup settings or local copy');
        }
        return () => { currentTemplateRef.current = ''; };
    }, [templateId]);

    useEffect(() => {
        let cancelled = false;
        const initEditorPage = async () => {
            setLoading(true);
            setLoadError(null);
            if (templateId) {
                const fingerprint = await getRememberedTemplateUnlock(String(templateId));
                let backupCredential: { id: string; token: string } | undefined;
                try {
                    const connection = parseBackupLink(window.location.hash, String(templateId))
                        || readConnection(localStorage, String(templateId));
                    if (connection) backupCredential = { id: connection.id, token: connection.token };
                } catch { /* Invalid links/storage cannot grant access; existing backup UI handles them after unlock. */ }
                templateAccessRef.current = { fingerprint: fingerprint || undefined, backup: backupCredential };
                let template;
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const result = await fetch('/api/templates/read', {
                        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30_000),
                        headers: { 'Content-Type': 'application/json',
                            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                        body: JSON.stringify({ templateId: String(templateId), ...templateAccessRef.current }),
                    });
                    if (cancelled) return;
                    if (result.status === 403) {
                        toast.error('ACCESS_DENIED: Please unlock this template from the dashboard.');
                        router.replace('/?group=category&tag=all');
                        return;
                    }
                    if (!result.ok) throw new Error(result.status === 429
                        ? 'Too many requests. Please try again later.' : 'Unable to load template. Please retry.');
                    template = (await result.json()).template;
                    if (!template || typeof template.html_blueprint !== 'string' || !Array.isArray(template.fields_config)) {
                        throw new Error('Template data is incomplete. Please retry or contact the template creator.');
                    }
                    if (!template.html_blueprint.trim() && template.fields_config.length === 0) {
                        throw new Error('This template has no code or input fields yet. Please contact the template creator.');
                    }
                } catch (error) {
                    if (cancelled) return;
                    const message = error instanceof Error ? error.message : 'Unable to load template.';
                    setLoadError(message);
                    toast.error(message, {
                        duration: Infinity, action: { label: 'Retry', onClick: () => window.location.reload() },
                    });
                    return;
                }
                if (cancelled) return;

                if (template) {
                    setBreadcrumbTags(template.template_tags || []);
                    let remote: BackupConnection | null = null;
                    let storedConnection: BackupConnection | null = null;
                    let linkFailed = false;
                    const hasLink = /(?:^#|&)backup=|(?:^#|&)token=/.test(window.location.hash);
                    try {
                        storedConnection = readConnection(localStorage, String(templateId));
                        const requested = parseBackupLink(window.location.hash, String(templateId)) || storedConnection;
                        if (requested) {
                            const result = await loadBackup(requested);
                            if (cancelled) return;
                            remote = { ...requested, templateId: String(templateId), revision: result.revision,
                                updatedAt: result.updatedAt, savedPayload: result.payload };
                        }
                    } catch {
                        if (cancelled) return;
                        if (hasLink) {
                            linkFailed = true;
                            setBackupReady(false);
                            setModalType('backup_unavailable');
                        } else {
                            toast.error('BACKUP_ERROR: โหลดออนไลน์ไม่สำเร็จ กำลังใช้งานที่เก็บในเครื่อง');
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
                    let localPayload: BackupPayload | null = null;

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
                                localPayload = { drafts: migratedDrafts, activeDraftId: nextActiveDraft.id };
                            }
                        } catch (e) { console.error(e); }
                    }
                    if (remote && !linkFailed) {
                        const action = backupOpenAction(!!savedDraft, localPayload, storedConnection, remote);
                        if (action === 'load') {
                            const nextDrafts = remote.savedPayload.drafts.map(draft => ({ ...draft, fieldValues: buildInitialValues(initialFields, draft.fieldValues) }));
                            const nextActive = nextDrafts.find(draft => draft.id === remote.savedPayload.activeDraftId) || nextDrafts[0];
                            try {
                                localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, drafts: nextDrafts, activeDraftId: nextActive.id }));
                                setDrafts(nextDrafts);
                                setActiveDraftId(nextActive.id);
                                resetFieldValues(nextActive.fieldValues);
                                storeBackupConnection(remote);
                                setBackupReady(true);
                            } catch {
                                setPendingRemoteBackup(remote);
                                setBackupReady(false);
                                setModalType('backup_open');
                                toast.error('BACKUP_ERROR: เก็บข้อมูลในเครื่องไม่สำเร็จ งานเดิมยังอยู่');
                            }
                        } else if (action === 'confirm') {
                            setPendingRemoteBackup(remote);
                            setBackupReady(false);
                            setModalType('backup_open');
                        }
                        // Same revision with unsaved local work: retain it, do not auto-replace.
                    }
                }
            }
            setLoading(false);
        };
        initEditorPage();

        return () => { cancelled = true; };
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
            if (event.defaultPrevented) return;
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

    const handleDuplicateDraft = () => {
        if (!activeDraft) return;

        const duplicatedValues = buildInitialValues(fields, cloneFieldValues(fieldValues));
        const nextDraft = createEditorDraft(`${activeDraft.name} Copy`, duplicatedValues);

        syncActiveDraft();
        setDrafts(prev => [...prev, nextDraft]);
        setActiveDraftId(nextDraft.id);
        resetFieldValues(nextDraft.fieldValues);
        toast.success(`DRAFT_DUPLICATED: ${nextDraft.name}`);
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

    const getRemovedBlockCacheKey = (blockName: string, parentBlockName?: string, parentEntryIndex?: number) => {
        return [activeDraftId, parentBlockName || 'ROOT', parentEntryIndex ?? 'ROOT', blockName].join('::');
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
            const cacheKey = getRemovedBlockCacheKey(blockName);
            const cachedEntry = entries.length === 0 ? removedBlockEntryCacheRef.current[cacheKey] : undefined;
            const nextEntry = cachedEntry
                ? createBlockEntry(blockFields, cachedEntry, childBlocks, cachedEntry)
                : createBlockEntry(blockFields, undefined, childBlocks);

            if (cachedEntry) delete removedBlockEntryCacheRef.current[cacheKey];

            return {
                ...prev,
                [blockName]: [...entries, nextEntry],
            };
        });
    };

    const handleRemoveBlockEntry = (blockName: string, entryIndex: number) => {
        setFieldValues(prev => {
            const entries = Array.isArray(prev[blockName]) && prev[blockName].length > 0
                ? [...prev[blockName]]
                : [];
            const removedEntry = entries[entryIndex];

            entries.splice(entryIndex, 1);
            if (entries.length === 0 && removedEntry) {
                removedBlockEntryCacheRef.current[getRemovedBlockCacheKey(blockName)] = cloneFieldValues(removedEntry);
            }

            return { ...prev, [blockName]: entries };
        });
    };

    const handleDuplicateBlockEntry = (blockName: string, entryIndex: number) => {
        setFieldValues(prev => {
            const entries = Array.isArray(prev[blockName]) && prev[blockName].length > 0
                ? [...prev[blockName]]
                : [];
            const sourceEntry = entries[entryIndex];
            if (!sourceEntry) return prev;

            const blockFields = getBlockFields(blockName);
            const childBlocks = getChildBlockFieldsMap(blockName);
            const duplicateEntry = createBlockEntry(blockFields, cloneFieldValues(sourceEntry), childBlocks, cloneFieldValues(sourceEntry));

            entries.splice(entryIndex + 1, 0, duplicateEntry);

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
            const cacheKey = getRemovedBlockCacheKey(childBlockName, parentBlockName, parentEntryIndex);
            const cachedEntry = childEntries.length === 0 ? removedBlockEntryCacheRef.current[cacheKey] : undefined;
            const nextChildEntry = cachedEntry
                ? createBlockEntry(childFields, cachedEntry)
                : createBlockEntry(childFields);

            if (cachedEntry) delete removedBlockEntryCacheRef.current[cacheKey];

            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: [...childEntries, nextChildEntry],
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
            const removedEntry = childEntries[childEntryIndex];

            childEntries.splice(childEntryIndex, 1);
            if (childEntries.length === 0 && removedEntry) {
                removedBlockEntryCacheRef.current[getRemovedBlockCacheKey(childBlockName, parentBlockName, parentEntryIndex)] = cloneFieldValues(removedEntry);
            }
            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: childEntries,
            };

            return { ...prev, [parentBlockName]: parentEntries };
        });
    };

    const handleDuplicateNestedBlockEntry = (parentBlockName: string, parentEntryIndex: number, childBlockName: string, childEntryIndex: number) => {
        setFieldValues(prev => {
            const parentFields = getBlockFields(parentBlockName);
            const childFields = getBlockFields(childBlockName, parentBlockName);
            const parentEntries = Array.isArray(prev[parentBlockName]) && prev[parentBlockName].length > 0
                ? [...prev[parentBlockName]]
                : [createBlockEntry(parentFields)];
            const parentEntry = { ...createBlockEntry(parentFields, parentEntries[parentEntryIndex]), ...parentEntries[parentEntryIndex] };
            const childEntries = Array.isArray(parentEntry[childBlockName]) && parentEntry[childBlockName].length > 0
                ? [...parentEntry[childBlockName]]
                : [];
            const sourceEntry = childEntries[childEntryIndex];
            if (!sourceEntry) return prev;

            const duplicateEntry = createBlockEntry(childFields, cloneFieldValues(sourceEntry));
            childEntries.splice(childEntryIndex + 1, 0, duplicateEntry);
            parentEntries[parentEntryIndex] = {
                ...parentEntry,
                [childBlockName]: childEntries,
            };

            return { ...prev, [parentBlockName]: parentEntries };
        });
    };

    const requireConfirmationAfterClear = () => {
        if (!backupConnection) return;
        const connection: BackupConnection = { ...backupConnection,
            requiresOverwriteConfirmation: true, overwriteConfirmationReason: 'clear' };
        persistConnection(localStorage, connection);
        setBackupConnection(connection);
    };

    const handleClearDraft = () => {
        if (loading || backupBusyRef.current) return;
        const defaults = buildInitialValues(fields);
        const initialDraft = createEditorDraft('Draft 1', defaults);
        try {
            requireConfirmationAfterClear();
            // Keep an explicit default draft. Removing storage and reloading would
            // make initialization treat this device as new and fetch the backup again.
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                templateId, activeDraftId: initialDraft.id, drafts: [initialDraft],
            }));
            setDrafts([initialDraft]);
            setActiveDraftId(initialDraft.id);
            resetFieldValues(defaults);
            removedBlockEntryCacheRef.current = {};
            setModalType(null);
            toast.success('SYSTEM: DRAFTS_RESET_TO_DEFAULT');
        } catch {
            toast.error('CRITICAL_ERROR: Failed to clear drafts');
        }
    };

    const handleClearCurrentDraft = () => {
        if (!activeDraft || loading || backupBusyRef.current) return;

        const defaults = buildInitialValues(fields);
        const clearedDrafts = drafts.map(draft => draft.id === activeDraft.id
            ? { ...draft, fieldValues: defaults, updatedAt: new Date().toISOString() }
            : draft
        );
        try {
            requireConfirmationAfterClear();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, activeDraftId, drafts: clearedDrafts }));
            resetFieldValues(defaults);
            setDrafts(clearedDrafts);
            removedBlockEntryCacheRef.current = {};
            setModalType(null);
            toast.success(`DRAFT_CLEARED: ${activeDraft.name}`);
        } catch {
            toast.error('CRITICAL_ERROR: Failed to clear draft');
        }
    };

    const openBackupLinkPreview = () => {
        setBackupLinkCopied(false);
        setModalType('backup_link');
    };

    const handleCopyBackupLink = async () => {
        try {
            await navigator.clipboard.writeText(previewBackupLink);
            setBackupLinkCopied(true);
            toast.success('SYSTEM: LINK_COPIED_TO_CLIPBOARD');
        } catch {
            toast.error('CRITICAL_ERROR: Failed to copy');
        }
    };

    const storeBackupConnection = (connection: BackupConnection) => {
        setBackupConnection(connection);
        setPreviewBackupLink(backupLink(window.location.origin, connection));
        try {
            // Adopt pre-link copies without discarding them when the first backup is created.
            const oldCopy = readLocalCopy(localStorage, String(templateId));
            if (oldCopy && !readLocalCopy(localStorage, String(templateId), connection.id)) {
                const migrated = { ...oldCopy, backupId: connection.id };
                localStorage.setItem(localCopyKey(String(templateId), connection.id), JSON.stringify(migrated));
            }
            persistConnection(localStorage, connection);
            setLocalCopy(readLocalCopy(localStorage, String(templateId), connection.id));
            if (oldCopy) localStorage.removeItem(localCopyKey(String(templateId)));
        } catch {
            toast.error('บันทึกออนไลน์แล้ว แต่จำลิงก์ในเครื่องไม่สำเร็จ กรุณาคัดลอกลิงก์เก็บไว้');
        }
    };

    const saveOnlineBackup = async (overwrite = false) => {
        if (backupBusyRef.current || loading || !backupReady || !activeDraftId) return;
        const savingTemplate = templateId;
        backupBusyRef.current = true;
        setBackupSaving(true);
        setBackupFailed(false);
        const payload = JSON.parse(JSON.stringify(currentBackupPayload)) as BackupPayload;
        try {
            let connection: BackupConnection;
            if (!backupConnection) {
                const { data: { session } } = await supabase.auth.getSession();
                const result = await createBackup(localStorage, String(templateId), payload, templateAccessRef.current, session?.access_token);
                connection = { id: result.id, token: result.token, templateId: String(templateId), revision: result.revision,
                    updatedAt: result.updatedAt, savedPayload: result.payload };
            } else {
                const result = await updateBackup(backupConnection, payload, overwrite ? conflictRevision ?? backupConnection.revision : undefined);
                connection = { ...backupConnection, revision: result.revision, updatedAt: result.updatedAt, savedPayload: payload, requiresOverwriteConfirmation: false };
            }
            if (currentTemplateRef.current !== savingTemplate) {
                persistConnection(localStorage, connection);
                return;
            }
            storeBackupConnection(connection);
            if (overwrite) {
                try {
                    localStorage.removeItem(localCopyKey(String(templateId), connection.id));
                    setLocalCopy(null);
                } catch { toast.error('บันทึกออนไลน์แล้ว แต่ลบสำเนาในเครื่องไม่สำเร็จ'); }
            }
            setConflictRevision(null);
            setBackupLinkCopied(false);
            setModalType('backup_link');
            toast.success(overwrite ? 'SYSTEM: BACKUP_OVERWRITTEN' : 'SYSTEM: BACKUP_SAVED');
        } catch (error) {
            if (currentTemplateRef.current !== savingTemplate) return;
            if (error instanceof BackupRequestError && error.status === 409 && error.revision) {
                setConflictRevision(error.revision);
                setBackupLinkCopied(false);
                setModalType('backup_conflict');
            } else {
                setBackupFailed(true);
                toast.error(error instanceof BackupRequestError && error.status === 429
                    ? `ใช้งานถี่เกินไป กรุณารอประมาณ ${Math.ceil((error.retryAfter || 60) / 60)} นาทีแล้วลองใหม่ งานในเครื่องยังอยู่`
                    : error instanceof BackupRequestError ? `BACKUP_ERROR: ${error.message}` : 'BACKUP_ERROR: Save failed. Please retry.');
            }
        } finally {
            backupBusyRef.current = false;
            setBackupSaving(false);
        }
    };

    const previewBackupDecision = async (decision: 'keep' | 'overwrite') => {
        if (decision === 'overwrite') { await saveOnlineBackup(true); return; }
        if (!backupConnection || backupBusyRef.current) return;
        const savingTemplate = templateId;
        backupBusyRef.current = true;
        setBackupSaving(true);
        const beforeLoad = JSON.parse(JSON.stringify(currentBackupPayload)) as BackupPayload;
        try {
            setLocalCopy(saveLocalCopy(localStorage, String(templateId), backupConnection.id, drafts, activeDraftId, fieldValues));
            const result = await loadBackup(backupConnection);
            if (currentTemplateRef.current !== savingTemplate) return;
            if (!sameBackupContent(beforeLoad, currentBackupPayloadRef.current)) {
                toast.info('งานในเครื่องเปลี่ยนระหว่างโหลด กรุณากด KEEP & LOAD อีกครั้ง');
                return;
            }
            const restoredDrafts = result.payload.drafts.map(draft => ({ ...draft, fieldValues: buildInitialValues(fields, draft.fieldValues) }));
            const restoredActive = restoredDrafts.find(draft => draft.id === result.payload.activeDraftId) || restoredDrafts[0];
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, drafts: restoredDrafts, activeDraftId: restoredActive.id }));
            setDrafts(restoredDrafts);
            setActiveDraftId(restoredActive.id);
            resetFieldValues(restoredActive.fieldValues);
            removedBlockEntryCacheRef.current = {};
            storeBackupConnection({ ...backupConnection, revision: result.revision, updatedAt: result.updatedAt, savedPayload: result.payload, requiresOverwriteConfirmation: false });
            setBackupFailed(false);
            setConflictRevision(null);
            setModalType(null);
            toast.success('SYSTEM: LOCAL_COPY_SAVED_AND_BACKUP_LOADED');
        } catch {
            toast.error('BACKUP_ERROR: Failed to keep and load. Current work was not replaced.');
        } finally {
            backupBusyRef.current = false;
            setBackupSaving(false);
        }
    };

    const handleLoadLocalCopy = () => {
        if (loading) return;
        try {
            // Re-read storage in case another tab replaced the copy after this page loaded.
            const saved = readLocalCopy(localStorage, String(templateId), backupConnection?.id || null);
            if (!saved) {
                setLocalCopy(null);
                setLocalCopiesOpen(false);
                toast.error('CRITICAL_ERROR: Local copy not found');
                return;
            }
            if (!localCopy || JSON.stringify(saved) !== JSON.stringify(localCopy)) {
                setLocalCopy(saved);
                toast.info('SYSTEM: LOCAL_COPY_CHANGED — Please confirm again');
                return;
            }
            const restoredDrafts = saved.drafts.map(draft => ({
                ...draft, fieldValues: buildInitialValues(fields, draft.fieldValues),
            }));
            const restoredActive = restoredDrafts.find(draft => draft.id === saved.activeDraftId)!;
            // Persist before replacing the visible work; a quota error leaves it intact.
            if (backupConnection) {
                const restoredConnection: BackupConnection = { ...backupConnection, requiresOverwriteConfirmation: true, overwriteConfirmationReason: 'restore' };
                persistConnection(localStorage, restoredConnection);
                setBackupConnection(restoredConnection);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, activeDraftId: saved.activeDraftId, drafts: restoredDrafts }));
            setDrafts(restoredDrafts);
            setActiveDraftId(saved.activeDraftId);
            resetFieldValues(restoredActive.fieldValues);
            removedBlockEntryCacheRef.current = {};
            setLocalCopiesOpen(false);
            toast.success('SYSTEM: LOCAL_COPY_LOADED');
        } catch {
            toast.error('CRITICAL_ERROR: Failed to load local copy');
        }
    };

    const cancelRemoteOpen = () => {
        setPendingRemoteBackup(null);
        setModalType(null);
        setBackupReady(true);
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    };

    const confirmRemoteOpen = async () => {
        if (!pendingRemoteBackup || backupBusyRef.current) return;
        const openingTemplate = templateId;
        const beforeLoad = JSON.parse(JSON.stringify(currentBackupPayload)) as BackupPayload;
        backupBusyRef.current = true;
        setBackupSaving(true);
        try {
            // Fetch first, but retain current local work before replacing anything.
            const remote = await loadBackup(pendingRemoteBackup);
            if (currentTemplateRef.current !== openingTemplate) return;
            if (!sameBackupContent(beforeLoad, currentBackupPayloadRef.current)) {
                toast.info('งานในเครื่องเปลี่ยนระหว่างโหลด กรุณายืนยันอีกครั้ง');
                return;
            }
            setLocalCopy(saveLocalCopy(localStorage, String(templateId), pendingRemoteBackup.id, drafts, activeDraftId, fieldValues));
            const nextDrafts = remote.payload.drafts.map(draft => ({ ...draft, fieldValues: buildInitialValues(fields, draft.fieldValues) }));
            const nextActive = nextDrafts.find(draft => draft.id === remote.payload.activeDraftId) || nextDrafts[0];
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, drafts: nextDrafts, activeDraftId: nextActive.id }));
            setDrafts(nextDrafts);
            setActiveDraftId(nextActive.id);
            resetFieldValues(nextActive.fieldValues);
            removedBlockEntryCacheRef.current = {};
            storeBackupConnection({ ...pendingRemoteBackup, revision: remote.revision, updatedAt: remote.updatedAt, savedPayload: remote.payload, requiresOverwriteConfirmation: false });
            setPendingRemoteBackup(null);
            setBackupReady(true);
            setModalType(null);
            toast.success('SYSTEM: LOCAL_COPY_SAVED_AND_BACKUP_LOADED');
        } catch {
            toast.error('BACKUP_ERROR: โหลดไม่สำเร็จ กรุณาลองใหม่');
        } finally {
            backupBusyRef.current = false;
            setBackupSaving(false);
        }
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
                    <div role={loadError ? 'alert' : 'status'} className="min-h-full flex-1 flex flex-col gap-4 items-center justify-center border border-dashed border-(--primary)/20 text-xs tracking-widest p-4 text-center">
                        <span className={loadError ? 'text-(--foreground)/75' : 'opacity-20 uppercase'}>{loadError || 'Fetching_Stored_Data...'}</span>
                        {loadError && <button type="button" onClick={() => window.location.reload()} className="border border-(--primary)/50 px-4 py-2 text-(--primary) hover:bg-(--primary) hover:text-black cursor-pointer">RETRY</button>}
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
                                <div className="flex-1 flex items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        disabled={!canUndo}
                                        onClick={undo}
                                        className="flex items-center justify-center border border-(--primary)/30 px-2 py-[3px] text-[10px] leading-4 uppercase text-(--primary) hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25 cursor-pointer transition-colors"
                                        title="Undo (Ctrl+Z)"
                                        aria-label="Undo"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
                                            <path d="M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canRedo}
                                        onClick={redo}
                                        className="flex items-center justify-center border border-(--primary)/30 px-2 py-[3px] text-[10px] leading-4 uppercase text-(--primary) hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25 cursor-pointer transition-colors"
                                        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                                        aria-label="Redo"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
                                            <path d="M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z" />
                                        </svg>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setModalType('clear_draft')}
                                        aria-label="Clear all drafts"
                                        title="Clear all drafts"
                                        className="flex items-center justify-center border border-(--foreground)/50 px-2 py-[3px] text-xs leading-4 opacity-30 hover:opacity-100 uppercase cursor-pointer lg:border-0 lg:px-0 lg:py-1"
                                    >
                                        <span className="hidden lg:inline content-center">[Clear_Draft]</span>
                                        <span className="lg:hidden">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                        </span>
                                    </button>
                                        {previewLocalCopyTime && (
                                        <button
                                            type="button"
                                            onClick={() => setLocalCopiesOpen(true)}
                                            aria-label="สำเนาในเครื่อง"
                                            title="Local copies — สำเนาในเครื่อง"
                                            className="flex items-center justify-center border border-(--primary)/40 px-2 py-[3px] text-xs leading-4 font-black uppercase text-(--primary) hover:bg-(--primary)/10 cursor-pointer lg:px-3"
                                        >
                                            <span className="hidden lg:inline">Local_Copies</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor" className="lg:hidden" aria-hidden="true" focusable="false">
                                                <path d="M480-120q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-480q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-840q82 0 155.5 35T760-706v-94h80v240H600v-80h110q-41-56-101-88t-129-32q-117 0-198.5 81.5T200-480q0 117 81.5 198.5T480-200q105 0 183.5-68T756-440h82q-15 137-117.5 228.5T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z" />
                                            </svg>
                                        </button>
                                        )}
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
                                        <div className="flex shrink-0 items-center gap-2">

                                        <button
                                            type="button"
                                            onClick={handleAddDraft}
                                            aria-label="เพิ่ม draft"
                                            title="Add draft — เพิ่ม draft"
                                            className="flex items-center justify-center cursor-pointer bg-(--primary) px-1.5 py-1 text-[10px] font-black uppercase text-(--background) transition-all hover:brightness-110 lg:px-3"
                                        >
                                            <span className="hidden lg:inline">Add_Draft</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor" className="lg:hidden" aria-hidden="true" focusable="false">
                                                <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                                            </svg>
                                        </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
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
                                            onClick={handleDuplicateDraft}
                                            className="cursor-pointer border border-(--primary)/30 px-3 py-2 text-[10px] font-black uppercase text-(--primary) transition-colors hover:border-(--primary) disabled:cursor-not-allowed disabled:opacity-25"
                                        >
                                            Duplicate
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
                                                        key={`${activeDraftId}-${field.id}`}
                                                        field={field}
                                                        value={fieldValues[field.variable_name]}
                                                        bbcodeHeights={getBBCodeHeights(fieldValues)}
                                                        onBBCodeHeightChange={(key, height) => setFieldValues(prev => updateBBCodeHeight(prev, [], key, height))}
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
                                                                onClick={() => handleDuplicateBlockEntry(blockName, entryIndex)}
                                                                className="cursor-pointer border border-(--primary)/30 px-2 py-1 text-[10px] uppercase text-(--primary) hover:border-(--primary) transition-colors"
                                                            >
                                                                Duplicate
                                                            </button>
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
                                                                                    key={`${activeDraftId}-${field.id}-${entryIndex}`}
                                                                                    field={field}
                                                                                    value={entryValues[field.variable_name]}
                                                                                    bbcodeHeights={getBBCodeHeights(entryValues)}
                                                                                    onBBCodeHeightChange={(key, height) => setFieldValues(prev => updateBBCodeHeight(prev, [blockName, entryIndex], key, height))}
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
                                                                                        onClick={() => handleDuplicateNestedBlockEntry(blockName, entryIndex, childBlock.blockName, childEntryIndex)}
                                                                                        className="ml-auto cursor-pointer border border-(--primary)/25 px-2 py-1 text-[10px] uppercase text-(--primary)/80 hover:border-(--primary) transition-colors"
                                                                                    >
                                                                                        Duplicate
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleRemoveNestedBlockEntry(blockName, entryIndex, childBlock.blockName, childEntryIndex)}
                                                                                        className="cursor-pointer border border-red-500/25 px-2 py-1 text-[10px] uppercase text-red-300 hover:border-red-500 transition-colors"
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
                                                                                                                key={`${activeDraftId}-${field.id}-${entryIndex}-${childEntryIndex}`}
                                                                                                                field={field}
                                                                                                                value={childEntryValues[field.variable_name]}
                                                                                                                bbcodeHeights={getBBCodeHeights(childEntryValues)}
                                                                                                                onBBCodeHeightChange={(key, height) => setFieldValues(prev => updateBBCodeHeight(prev, [blockName, entryIndex, childBlock.blockName, childEntryIndex], key, height))}
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
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-(--primary)/75 pb-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-3">
                                <h3 className="text-xl text-(--primary) uppercase whitespace-nowrap">Live_Preview</h3>
                                <p className="col-span-2 row-start-2 min-w-0 text-[11px] text-(--foreground)/35 my-0 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:truncate" title={backupStatus} role="status">
                                    {backupStatus}
                                </p>
                                <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 pt-[2px] lg:col-start-3">
                                {previewBackupLink && (
                                    <button type="button" onClick={openBackupLinkPreview} aria-label="เปิดลิงก์ Backup" title="เปิดลิงก์ Backup" className="flex items-center justify-center px-1 py-1 text-(--foreground)/60 hover:text-(--foreground) cursor-pointer">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor" aria-hidden="true" focusable="false">
                                            <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z" />
                                        </svg>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => saveOnlineBackup()}
                                    disabled={loading || !backupReady || backupSaving}
                                    aria-label="บันทึกออนไลน์"
                                    title="บันทึกออนไลน์"
                                    className="flex items-center justify-center border border-(--primary) px-2 py-[3px] text-xs font-black text-(--primary) uppercase hover:bg-(--primary)/10 cursor-pointer disabled:opacity-50 disabled:cursor-wait lg:px-4"
                                >
                                    <span className="hidden lg:inline">Save</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor" className="lg:hidden" aria-hidden="true" focusable="false">
                                        <path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z" />
                                    </svg>
                                </button>
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
                        </div>
                        
                        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                            {/* generate Live Preview */}
                            <LivePreview html={liveHTML} />
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={localCopiesOpen} onClose={() => setLocalCopiesOpen(false)} title="Load Local Copy">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-amber-400 mb-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden="true">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                            <path d="M12 9v4m0 3v1" />
                        </svg>
                        <span className="text-xs uppercase font-black tracking-[0.2em]">Restore_Local_Copy</span>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs leading-relaxed text-(--foreground)/60">
                            โหลดสำเนาที่เก็บไว้เมื่อ <span className="font-bold text-amber-300">{previewLocalCopyTime}</span> แทนงานในเครื่องตอนนี้?
                        </p>
                        <p className="text-[10px] uppercase leading-tight text-(--foreground)/40">Warning: This replaces all current local drafts. Your online backup will stay unchanged.</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setLocalCopiesOpen(false)} className="flex-1 border border-(--primary)/20 px-3 py-2 text-xs font-bold text-(--foreground) hover:bg-(--foreground)/5 cursor-pointer">CANCEL</button>
                        <button type="button" disabled={loading || backupSaving || !previewLocalCopyTime} onClick={handleLoadLocalCopy} className="flex-1 bg-(--primary) px-3 py-2 text-xs font-bold text-(--background) hover:brightness-110 disabled:opacity-50 cursor-pointer">LOAD COPY</button>
                    </div>
                </div>
            </Modal>

            <Modal 
                isOpen={modalType !== null} 
                onClose={() => { if (backupSaving) return; if (modalType === 'backup_open' || modalType === 'backup_unavailable') cancelRemoteOpen(); else setModalType(null); }}
                title={modalType === 'clear_draft' ? 'Clear All Drafts' : modalType === 'clear_current_draft' ? 'Clear Current Draft' : modalType === 'delete_draft' ? 'Delete Draft' : modalType === 'rename_draft' ? 'Rename Draft' : modalType === 'backup_link' ? 'Backup Link' : modalType === 'backup_conflict' ? 'Backup Conflict' : modalType === 'backup_open' ? 'Open Backup' : modalType === 'backup_unavailable' ? 'Backup Unavailable' : ''}
            >
                {(modalType === 'backup_open' || modalType === 'backup_unavailable') && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-amber-400">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4m0 3v1" /></svg>
                            <span className="text-xs uppercase font-black tracking-[0.2em]">{modalType === 'backup_open' ? 'Local_Work_Found' : 'Link_Unavailable'}</span>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-(--foreground)/60 leading-relaxed">{modalType === 'backup_open' ? 'มีงานในเครื่องที่ต่างจากฉบับออนไลน์ เก็บเป็นสำเนาแล้วโหลดชุดออนไลน์แทนไหม?' : 'เปิด backup ไม่สำเร็จ ลิงก์อาจไม่ถูกต้อง หรือการเชื่อมต่อมีปัญหา งานในเครื่องยังอยู่'}</p>
                            <p className="text-[10px] uppercase text-(--foreground)/40 leading-tight">{modalType === 'backup_open' ? 'Keep & Load replaces the current draft set after keeping one local copy. Your online backup stays unchanged.' : 'Check the link and connection, then reopen it to retry. Continue Local keeps your current work.'}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button type="button" disabled={backupSaving} onClick={cancelRemoteOpen} className="flex-1 border border-(--primary)/20 px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50">{modalType === 'backup_open' ? 'CANCEL' : 'CONTINUE LOCAL'}</button>
                            {modalType === 'backup_open' && <button type="button" disabled={backupSaving} onClick={confirmRemoteOpen} className="flex-1 bg-(--primary) text-(--background) px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50">KEEP &amp; LOAD</button>}
                        </div>
                    </div>
                )}
                {(modalType === 'backup_link' || modalType === 'backup_conflict') && (
                    <div className="space-y-6">
                        {modalType === 'backup_conflict' ? (
                            <>
                                <div className="flex items-center gap-2 text-amber-400 mb-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden="true">
                                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                        <path d="M12 9v4m0 3v1" />
                                    </svg>
                                    <span className="text-xs uppercase font-black tracking-[0.2em]">{backupConnection?.requiresOverwriteConfirmation ? (backupConnection.overwriteConfirmationReason === 'clear' ? 'Draft_Cleared' : 'Local_Copy_Restored') : 'Newer_Backup_Found'}</span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-(--foreground)/60 text-xs leading-relaxed">
                                        {backupConnection?.requiresOverwriteConfirmation ? <>{backupConnection.overwriteConfirmationReason === 'clear' ? <>คุณได้ <span className="text-amber-300 font-bold">ล้าง draft ในเครื่อง</span></> : <>คุณกำลังใช้ <span className="text-amber-300 font-bold">สำเนาในเครื่อง</span></>} ยืนยันบันทึกทับฉบับออนไลน์ หรือเก็บงานนี้แล้วโหลดฉบับออนไลน์ล่าสุด</> : <>พบ <span className="text-amber-300 font-bold">การแก้ไขใหม่</span> เลือกเก็บดราฟต์นี้เป็นสำเนาแล้วโหลดดราฟต์ล่าสุด หรือบันทึกทับฉบับออนไลน์ (สามารถดึงสำเนาได้ที่ปุ่ม LOCAL_DRAFT หรือไอคอน svg)</>}
                                    </p>
                                    <p className="text-[10px] text-(--foreground)/40 uppercase leading-tight">
                                        Warning: Overwrite replaces this online backup and deletes its temporary local copy. Keep &amp; Load keeps one copy, then loads the latest version.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                        <div className="flex items-center gap-2 text-green-500 mb-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-xs uppercase font-black tracking-[0.2em]">Backup_Ready</span>
                        </div>
                        <div className="space-y-2">
                            <p className="text-(--foreground)/60 text-xs leading-relaxed">
                                ใช้ลิงก์นี้เพื่อแก้ไข <span className="text-green-400 font-bold">draft ทั้งหมดของเทมเพลตนี้</span> บนเครื่องอื่น
                            </p>
                            <p className="text-[10px] text-(--foreground)/40 uppercase leading-tight">
                                Warning: Anyone with this link can view and edit all drafts in this backup. Keep this link private.
                            </p>
                        </div>
                            </>
                        )}
                        <div>
                            <label htmlFor="backup-link-preview" className="mb-2 block text-xs text-(--foreground)/60">BACKUP LINK</label>
                            <div className="flex min-w-0 items-stretch gap-2">
                                <input id="backup-link-preview" type="text" readOnly value={previewBackupLink} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 border border-(--primary)/40 bg-(--background) px-3 py-2 text-xs text-(--foreground) outline-none focus:border-(--primary)" />
                                <button type="button" onClick={handleCopyBackupLink} className="shrink-0 bg-(--primary) px-3 py-2 text-xs font-black text-(--background) hover:brightness-110 cursor-pointer">
                                    {backupLinkCopied ? 'COPIED' : 'COPY'}
                                </button>
                            </div>
                            <p className="mt-2 text-[10px] text-(--foreground)/40 uppercase leading-tight" role="status">
                                {backupLinkCopied ? 'Link copied.' : (
                                    <>
                                        Reopen this link using the link icon{' '}
                                        <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="inline-block align-middle" aria-hidden="true" focusable="false">
                                            <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z" />
                                        </svg>{' '}
                                        next to SAVE.
                                    </>
                                )}
                            </p>
                        </div>
                        {modalType === 'backup_conflict' && (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button type="button" onClick={() => setModalType(null)} className="flex-1 border border-(--primary)/20 px-3 py-2 text-xs font-bold text-(--foreground) hover:bg-(--foreground)/5 cursor-pointer">CANCEL</button>
                                <button type="button" disabled={backupSaving} onClick={() => previewBackupDecision('keep')} className="flex-1 border border-(--primary) px-3 py-2 text-xs font-bold text-(--primary) whitespace-nowrap hover:bg-(--primary)/10 cursor-pointer disabled:opacity-50">KEEP &amp; LOAD</button>
                                <button type="button" disabled={backupSaving} onClick={() => previewBackupDecision('overwrite')} className="flex-1 bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 cursor-pointer disabled:opacity-50">OVERWRITE</button>
                            </div>
                        )}
                    </div>
                )}
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
                                Warning: This replaces all current local drafts with template defaults.
                                Your online backup and saved local copy stay unchanged.
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
