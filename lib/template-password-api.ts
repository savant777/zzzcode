import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { encryptTemplatePassword, decryptTemplatePassword } from './template-password-crypto';
type Dependencies = { db: SupabaseClient; userDb: SupabaseClient };
export async function handleTemplatePasswordRequest(request: Request, operation: 'save' | 'read', injected?: Dependencies) {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return reply({ error: 'INVALID_ORIGIN' }, 403);
        const bearer = request.headers.get('authorization');
        if (!bearer?.startsWith('Bearer ')) return reply({ error: 'AUTH_REQUIRED' }, 401);
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const deps = injected ?? {
            db: createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }),
            userDb: createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } }),
        };
        const { data: auth, error: authError } = await deps.db.auth.getUser(bearer.slice(7));
        if (authError || !auth.user) return reply({ error: 'AUTH_REQUIRED' }, 401);
        const { data: creator, error: creatorError } = await deps.db.from('creators').select('role,is_active').eq('user_id', auth.user.id).maybeSingle();
        if (creatorError) throw creatorError;
        if (!creator?.is_active) return reply({ error: 'CREATOR_REQUIRED' }, 403);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 2 * 1024 * 1024) return reply({ error: 'PAYLOAD_TOO_LARGE' }, 413);
        const body = JSON.parse(raw);
        const id = body.templateId == null ? null : String(body.templateId);
        if ((id !== null && !/^[1-9][0-9]*$/.test(id)) || (operation === 'read' && id === null)) return reply({ error: 'INVALID_TEMPLATE_ID' }, 400);
        if (id !== null) {
            const { data: template, error } = await deps.db.from('templates').select('user_id,is_personal').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!template || (creator.role !== 'owner' && template.user_id !== auth.user.id)) return reply({ error: 'TEMPLATE_OWNER_REQUIRED' }, 403);
        }
        if (operation === 'read') {
            const { data, error } = await deps.db.rpc('read_template_password_encrypted', { p_template_id: id });
            if (error) throw error;
            return reply({ password: data ? decryptTemplatePassword('template-password', data) : null });
        }
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data) || (body.password != null && typeof body.password !== 'string')) return reply({ error: 'INVALID_PAYLOAD' }, 400);
        const password = body.data.is_personal === true && body.password ? body.password : null;
        const encrypted = password ? encryptTemplatePassword('template-password', password) : null;
        const { data, error } = await deps.userDb.rpc('save_template', { p_template_id: id, p_data: body.data, p_password: password, p_password_encrypted: encrypted });
        if (error) return reply({ error: error.message }, 400);
        return reply({ template: data });
    } catch (error) {
        return reply({ error: error instanceof Error && error.message === 'PASSWORD_ENCRYPTION_NOT_CONFIGURED' ? error.message : 'TEMPLATE_PASSWORD_UNAVAILABLE' }, 503);
    }
}
