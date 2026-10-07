import { supabase } from './supabase';
export async function creatorTemplateRequest(path: 'save' | 'password', body: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('AUTH_REQUIRED');
    const response = await fetch(`/api/templates/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'TEMPLATE_SAVE_FAILED');
    return result;
}
