import { isHogthaiTemplate } from '@/lib/dashboard';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { binAllowed, binToken, validBinPassword } from '@/lib/bin-server';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
    try {
        if (!process.env.BIN_PASSWORD) return reply({ error: 'ยังไม่ได้ตั้งค่า BIN_PASSWORD บนเซิร์ฟเวอร์' }, 503);
        if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({}, 403);
        const raw = await request.text(); if (raw.length > 1024) return reply({}, 413);
        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
        const hash = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update('bin:' + (request.headers.get('x-forwarded-for') || 'unknown')).digest('hex');
        const { error: quotaError, data: quota } = await db.rpc('consume_editor_backup_rate_limit', { p_client_hash: hash, p_operation: 'read' });
        if (quotaError || !quota?.allowed) return reply({ error: 'Please try again later.' }, 429);
        if (!validBinPassword(JSON.parse(raw).password)) return reply({ error: 'รหัสไม่ถูกต้อง' }, 403);
        return reply({ token: binToken() });
    } catch { return reply({ error: 'Bin unavailable' }, 503); }
}
export async function GET(request: Request) {
    if (!binAllowed(request)) return reply({}, 403);
    try {
        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
        const { data, error } = await db.rpc('bin_catalog');
        return error ? reply({}, 503) : reply({ templates: (Array.isArray(data) ? data : []).filter(item => isHogthaiTemplate(item.template_tags) === (new URL(request.url).searchParams.get('catalog') === 'hogthai')) });
    } catch { return reply({}, 503); }
}
