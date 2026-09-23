import type { SupabaseClient } from '@supabase/supabase-js';

export async function deactivateTemplate(db: SupabaseClient, templateId: string | number) {
    return setTemplateActive(db, templateId, false);
}

export async function setTemplateActive(db: SupabaseClient, templateId: string | number, active: boolean) {
    const { data, error } = await db.from('templates')
        .update({ is_active: active })
        .eq('id', templateId)
        .select('id, is_active')
        .single();
    if (error) throw new Error(error.message);
    if (!data || String(data.id) !== String(templateId) || data.is_active !== active) {
        throw new Error('ไม่สามารถยืนยันสถานะเทมเพลตได้ กรุณาลองใหม่');
    }
}
