import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MAX_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,template_id,payload,revision,created_at,updated_at';
type JsonObject = Record<string, unknown>;
type Dependencies = { db: SupabaseClient; secret: string };
class ApiError extends Error {
    constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const response = (body: unknown, status = 200, retryAfter?: number) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
});

export function validateBackupPayload(value: unknown) {
    if (!object(value) || typeof value.activeDraftId !== 'string' || !Array.isArray(value.drafts)
        || value.drafts.length < 1 || value.drafts.length > 200) throw new ApiError(400, 'INVALID_PAYLOAD');
    const ids = new Set<string>();
    for (const draft of value.drafts) {
        if (!object(draft) || typeof draft.id !== 'string' || !draft.id || draft.id.length > 200
            || ids.has(draft.id) || typeof draft.name !== 'string' || !draft.name.length || draft.name.length > 500
            || !object(draft.fieldValues) || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt))) {
            throw new ApiError(400, 'INVALID_PAYLOAD');
        }
        ids.add(draft.id);
    }
    if (!ids.has(value.activeDraftId)) throw new ApiError(400, 'INVALID_ACTIVE_DRAFT');
    // PostgreSQL jsonb adds spacing. This serialization is an upper bound for that spacing.
    if (Buffer.byteLength(JSON.stringify(value, null, 1), 'utf8') > MAX_BYTES) throw new ApiError(413, 'BACKUP_TOO_LARGE');
    return value;
}

function templateId(value: unknown): string {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > BigInt('9223372036854775807')) {
        throw new ApiError(400, 'INVALID_TEMPLATE_ID');
    }
    return value;
}

async function readBody(request: Request): Promise<JsonObject> {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED');
    if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new ApiError(413, 'BACKUP_TOO_LARGE');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'INVALID_JSON');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > MAX_BYTES) {
                await reader.cancel();
                throw new ApiError(413, 'BACKUP_TOO_LARGE');
            }
            chunks.push(part.value);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!object(parsed)) throw new Error('Not an object');
        return parsed;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(400, 'INVALID_JSON');
    } finally { reader.releaseLock(); }
}

// Cheap per-process backstop; the database below enforces the shared quota.
const buckets = new Map<string, { count: number; until: number }>();
function clientAddress(request: Request) {
    if (!process.env.VERCEL) return 'local';
    // Only trust Vercel's overwritten header, never a caller's X-Forwarded-For.
    const ip = request.headers.get('x-vercel-forwarded-for')?.trim();
    if (!ip || !isIP(ip)) throw new ApiError(503, 'CLIENT_ADDRESS_UNAVAILABLE', 60);
    // Canonicalize alternate IPv6 spellings so they share a counter.
    return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.toLowerCase() : ip;
}
function guardRequest(request: Request, operation: string) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        throw new ApiError(403, 'CROSS_ORIGIN_REQUEST');
    }
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
    // Use platform-controlled client IP on Vercel; locally use one shared bucket.
    const ip = clientAddress(request);
    const key = `${operation}:${digest(ip)}`;
    const bucket = buckets.get(key) || { count: 0, until: now + 60_000 };
    if (!buckets.has(key) && buckets.size >= 10_000) throw new ApiError(429, 'RATE_LIMITED', 60);
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > (operation === 'create' ? 10 : 120)) throw new ApiError(429, 'RATE_LIMITED', Math.max(1, Math.ceil((bucket.until - now) / 1000)));
}

async function sharedRateLimit(request: Request, operation: string, { db, secret }: Dependencies) {
    // A keyed hash prevents raw IP storage and offline guessing of IPv4 addresses.
    const hash = createHmac('sha256', secret).update(`editor-rate-limit:v1:${clientAddress(request)}`).digest('hex');
    const { data, error } = await db.rpc('consume_editor_backup_rate_limit', { p_client_hash: hash, p_operation: operation });
    if (error || !data || typeof data.allowed !== 'boolean') throw new ApiError(503, 'BACKUP_RATE_LIMIT_UNAVAILABLE', 60);
    if (!data.allowed) throw new ApiError(429, 'RATE_LIMITED',
        Number.isInteger(data.retryAfter) && data.retryAfter > 0 ? Math.min(data.retryAfter, 86400) : 60);
}

function dependencies(): Dependencies {
    if (typeof window !== 'undefined') throw new Error('Server only');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) throw new ApiError(503, 'BACKUP_NOT_CONFIGURED');
    return { secret, db: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

function tokenFrom(request: Request) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
    if (!match) throw new ApiError(404, 'BACKUP_NOT_FOUND');
    return match[1];
}

async function checkTemplate(db: SupabaseClient, id: string, password?: unknown, creating = false) {
    const { data, error } = await db.from('templates').select('id,is_active,is_personal,password').eq('id', id).maybeSingle();
    if (error) throw new ApiError(503, 'BACKUP_UNAVAILABLE');
    if (!data || data.is_active === false) throw new ApiError(404, 'TEMPLATE_NOT_FOUND');
    // Existing editor passwords are stored as plain text. Never trust its client-side unlocked flag.
    if (creating && data.is_personal) {
        if (typeof password !== 'string' || typeof data.password !== 'string'
            || !timingSafeEqual(Buffer.from(digest(password)), Buffer.from(digest(data.password)))) {
            throw new ApiError(403, 'TEMPLATE_PASSWORD_REQUIRED');
        }
    }
}

function publicBackup(row: JsonObject) {
    return { id: row.id, templateId: String(row.template_id), payload: row.payload,
        revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Route-only entry point; dependency injection supports isolated tests without a live database. */
export async function handleBackupRequest(request: Request, operation: 'create' | 'read' | 'save', id?: string, injected?: Dependencies) {
    try {
        guardRequest(request, operation);
        const deps = injected || dependencies();
        await sharedRateLimit(request, operation, deps);
        if (operation !== 'create' && (!id || !UUID.test(id))) throw new ApiError(404, 'BACKUP_NOT_FOUND');
        const token = operation === 'create' ? null : tokenFrom(request);
        const body = operation === 'read' ? null : await readBody(request);
        const tid = templateId(operation === 'read' ? new URL(request.url).searchParams.get('templateId') : body?.templateId);
        const payload = body ? validateBackupPayload(body.payload) : null;
        const { db, secret } = deps;

        if (operation === 'create') {
            const requestKey = request.headers.get('idempotency-key');
            // Secret retry key, not the public backup ID. Otherwise knowing an ID
            // would allow an unauthenticated create retry to recover its token.
            if (!requestKey || !/^[A-Za-z0-9_-]{43}$/.test(requestKey)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
            await checkTemplate(db, tid, body?.templatePassword, true);
            const idHex = createHmac('sha256', secret).update(`editor-backup-id:v1:${tid}:${requestKey}`).digest('hex');
            const requestId = `${idHex.slice(0, 8)}-${idHex.slice(8, 12)}-4${idHex.slice(13, 16)}-8${idHex.slice(17, 20)}-${idHex.slice(20, 32)}`;
            const newToken = createHmac('sha256', secret).update(`editor-backup-token:v1:${tid}:${requestKey}`).digest('base64url');
            const { data, error } = await db.from('editor_backups').insert({
                id: requestId, template_id: tid, access_token_hash: digest(newToken), payload,
            }).select(COLUMNS).single();
            if (error?.code === '23505') {
                const existing = await db.from('editor_backups').select(COLUMNS).eq('id', requestId)
                    .eq('template_id', tid).eq('access_token_hash', digest(newToken)).maybeSingle();
                if (existing.error) throw new ApiError(503, 'BACKUP_UNAVAILABLE');
                if (!existing.data) throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT');
                return response({ ...publicBackup(existing.data), token: newToken }, 200);
            }
            if (error || !data) throw new ApiError(error?.code === '23514' ? 400 : 503, error?.code === '23514' ? 'INVALID_PAYLOAD' : 'BACKUP_UNAVAILABLE');
            return response({ ...publicBackup(data), token: newToken }, 201);
        }

        // Both ID and token must match before any backup or template metadata is returned.
        const found = await db.from('editor_backups').select(COLUMNS).eq('id', id!)
            .eq('template_id', tid).eq('access_token_hash', digest(token!)).maybeSingle();
        if (found.error) throw new ApiError(503, 'BACKUP_UNAVAILABLE');
        if (!found.data) throw new ApiError(404, 'BACKUP_NOT_FOUND');
        await checkTemplate(db, tid);
        if (operation === 'read') return response(publicBackup(found.data));

        if (!Number.isSafeInteger(body?.expectedRevision) || (body!.expectedRevision as number) < 1) throw new ApiError(400, 'INVALID_REVISION');
        const result = await db.rpc('save_editor_backup', {
            p_backup_id: id, p_template_id: tid, p_access_token_hash: digest(token!),
            p_expected_revision: body!.expectedRevision, p_payload: payload,
        });
        if (result.error) throw new ApiError(result.error.code === '22023' ? 400 : 503, result.error.code === '22023' ? 'INVALID_PAYLOAD' : 'BACKUP_UNAVAILABLE');
        if (result.data?.status === 'not_found') throw new ApiError(404, 'BACKUP_NOT_FOUND');
        if (result.data?.status === 'conflict') return response({ status: 'conflict', revision: result.data.revision, updatedAt: result.data.updatedAt }, 409);
        if (result.data?.status !== 'saved') throw new ApiError(503, 'BACKUP_UNAVAILABLE');
        return response({ status: 'saved', id: result.data.id, revision: result.data.revision, updatedAt: result.data.updatedAt });
    } catch (error) {
        // Never expose Supabase messages, tokens, or secrets in responses/logs.
        return response({ error: error instanceof ApiError ? error.message : 'BACKUP_UNAVAILABLE',
            ...(error instanceof ApiError && error.retryAfter ? { retryAfter: error.retryAfter } : {}) },
            error instanceof ApiError ? error.status : 503, error instanceof ApiError ? error.retryAfter : undefined);
    }
}
