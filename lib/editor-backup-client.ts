import type { CopyDraft } from './editor-local-copy';

export type BackupPayload = { activeDraftId: string; drafts: CopyDraft[] };
export type BackupConnection = {
    id: string; token: string; templateId: string; revision: number;
    updatedAt: string; savedPayload: BackupPayload;
    requiresOverwriteConfirmation?: boolean;
    overwriteConfirmationReason?: 'clear' | 'restore';
};
export type BackupResult = { id: string; templateId: string; revision: number; updatedAt: string; payload: BackupPayload; token?: string };
export class BackupRequestError extends Error {
    constructor(public status: number, message: string, public revision?: number, public retryAfter?: number) { super(message); }
}
export const connectionKey = (templateId: string) => `zzzcode_backup_connection_${templateId}`;
const pendingKey = (templateId: string) => `zzzcode_backup_pending_${templateId}`;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f-]{36}$/i;

export function readConnection(storage: Storage, templateId: string): BackupConnection | null {
    const raw = storage.getItem(connectionKey(templateId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.templateId !== templateId || !uuidPattern.test(value.id) || !tokenPattern.test(value.token)
        || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isFinite(Date.parse(value.updatedAt))
        || !Array.isArray(value.savedPayload?.drafts) || !value.savedPayload.drafts.length) throw new Error('INVALID_BACKUP_CONNECTION');
    return value;
}

// Ignore autosave timestamps and selection changes when deciding whether edits are unsaved.
export function sameBackupContent(a: BackupPayload, b: BackupPayload): boolean {
    const content = (payload: BackupPayload) => payload.drafts.map(({ id, name, fieldValues }) => ({ id, name, fieldValues }));
    return JSON.stringify(content(a)) === JSON.stringify(content(b));
}

export function backupOpenAction(hasLocalData: boolean, local: BackupPayload | null,
    stored: BackupConnection | null, remote: BackupConnection): 'load' | 'confirm' | 'keep' {
    if (!hasLocalData) return 'load';
    if (!local) return 'confirm';
    const sameConnection = stored?.id === remote.id;
    if (sameConnection && stored?.requiresOverwriteConfirmation) {
        return stored.revision === remote.revision ? 'keep' : 'confirm';
    }
    if (sameBackupContent(local, remote.savedPayload)
        || (sameConnection && stored && sameBackupContent(local, stored.savedPayload))) return 'load';
    return !sameConnection || stored?.revision !== remote.revision ? 'confirm' : 'keep';
}

export function backupLink(origin: string, connection: BackupConnection) {
    return `${origin}/editor/${connection.templateId}#backup=${connection.id}&token=${connection.token}`;
}

export function parseBackupLink(fragment: string, templateId: string): Pick<BackupConnection, 'id' | 'token' | 'templateId'> | null {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    if (!params.has('backup') && !params.has('token')) return null;
    const id = params.get('backup') || '';
    const token = params.get('token') || '';
    if (!uuidPattern.test(id) || !tokenPattern.test(token)) throw new Error('INVALID_BACKUP_LINK');
    return { id, token, templateId };
}

async function request(url: string, options: RequestInit): Promise<BackupResult> {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    let result;
    try { result = await response.json(); } catch { throw new BackupRequestError(response.status, 'BACKUP_UNAVAILABLE'); }
    if (!response.ok) throw new BackupRequestError(response.status, result.error || result.status || 'BACKUP_UNAVAILABLE', result.revision,
        Number(response.headers.get('Retry-After')) || result.retryAfter || undefined);
    return result;
}

export async function createBackup(storage: Storage, templateId: string, payload: BackupPayload, templatePassword?: string): Promise<BackupResult & { token: string }> {
    let pending = storage.getItem(pendingKey(templateId));
    if (!pending) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        pending = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        // Persist retry credentials BEFORE making the request, including across refreshes.
        storage.setItem(pendingKey(templateId), pending);
    }
    if (!tokenPattern.test(pending)) throw new Error('INVALID_PENDING_BACKUP');
    const result = await request('/api/editor/backups', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending },
        body: JSON.stringify({ templateId, payload, templatePassword }),
    });
    if (!result.token || !tokenPattern.test(result.token)) throw new Error('INVALID_BACKUP_RESPONSE');
    return { ...result, token: result.token };
}

export async function updateBackup(connection: BackupConnection, payload: BackupPayload, expectedRevision?: number) {
    if (connection.requiresOverwriteConfirmation && expectedRevision === undefined) {
        const latest = await loadBackup(connection);
        throw new BackupRequestError(409, 'LOCAL_COPY_REQUIRES_CONFIRMATION', latest.revision);
    }
    return request(`/api/editor/backups/${connection.id}`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` },
        body: JSON.stringify({ templateId: connection.templateId, payload, expectedRevision: expectedRevision ?? connection.revision }),
    });
}

export async function loadBackup(connection: Pick<BackupConnection, 'id' | 'token' | 'templateId'>) {
    return request(`/api/editor/backups/${connection.id}?templateId=${connection.templateId}`, {
        method: 'GET', headers: { Authorization: `Bearer ${connection.token}` },
    });
}

export function persistConnection(storage: Storage, connection: BackupConnection) {
    storage.setItem(connectionKey(connection.templateId), JSON.stringify(connection));
    storage.removeItem(pendingKey(connection.templateId));
}
