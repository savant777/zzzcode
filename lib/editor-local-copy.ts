export type CopyDraft = {
    id: string;
    name: string;
    fieldValues: Record<string, unknown>;
    updatedAt: string;
};

export type LocalDraftCopy = {
    version: 1;
    templateId: string;
    backupId: string | null;
    savedAt: string;
    activeDraftId: string;
    drafts: CopyDraft[];
};

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export const localCopyKey = (templateId: string, backupId: string | null = null) =>
    `zzzcode_local_copy:${JSON.stringify([templateId, backupId])}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export function readLocalCopy(storage: StorageAccess, templateId: string, backupId: string | null = null): LocalDraftCopy | null {
    const raw = storage.getItem(localCopyKey(templateId, backupId));
    if (!raw) return null;
    const copy = JSON.parse(raw);
    if (!isRecord(copy) || copy.version !== 1 || copy.templateId !== templateId || copy.backupId !== backupId
        || typeof copy.savedAt !== 'string' || !Number.isFinite(Date.parse(copy.savedAt))
        || typeof copy.activeDraftId !== 'string' || !Array.isArray(copy.drafts) || !copy.drafts.length) {
        throw new Error('Invalid local copy');
    }
    const ids = new Set<string>();
    for (const draft of copy.drafts) {
        if (!isRecord(draft) || typeof draft.id !== 'string' || !draft.id || ids.has(draft.id)
            || typeof draft.name !== 'string' || !isRecord(draft.fieldValues)
            || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt))) {
            throw new Error('Invalid draft in local copy');
        }
        ids.add(draft.id);
    }
    if (!ids.has(copy.activeDraftId)) throw new Error('Missing active draft');
    return copy as LocalDraftCopy;
}

export function saveLocalCopy(storage: StorageAccess, templateId: string, backupId: string | null,
    drafts: CopyDraft[], activeDraftId: string, fieldValues: Record<string, unknown>): LocalDraftCopy {
    if (!drafts.length || !drafts.some(draft => draft.id === activeDraftId)) throw new Error('No active draft');
    const savedAt = new Date().toISOString();
    // Read the current form values, including edits not yet written by autosave.
    const copy: LocalDraftCopy = JSON.parse(JSON.stringify({
        version: 1, templateId, backupId, savedAt, activeDraftId,
        drafts: drafts.map(draft => draft.id === activeDraftId
            ? { ...draft, fieldValues, updatedAt: savedAt } : draft),
    }));
    // A single key replaces the previous snapshot. Failed writes propagate to the caller.
    storage.setItem(localCopyKey(templateId, backupId), JSON.stringify(copy));
    return copy;
}
