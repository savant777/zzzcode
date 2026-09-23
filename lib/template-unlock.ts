// A convenience cache for the existing client-side password gate, not server authorization.
// Store only a fingerprint on disk; bind it to both template ID and current password.
const currentPageUnlocks = new Map<string, string>();
const unlockKey = (id: string) => `zzzcode_template_unlock_v1_${id}`;

async function fingerprint(id: string, password: string): Promise<string | null> {
    try {
        const bytes = new TextEncoder().encode(JSON.stringify([id, password]));
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
        return null;
    }
}

export async function isTemplateUnlocked(id: string, password: unknown): Promise<boolean> {
    if (typeof password !== 'string') return false;
    if (currentPageUnlocks.get(id) === password) return true;
    const expected = await fingerprint(id, password);
    if (!expected) return false;
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
        try {
            if (window[kind].getItem(unlockKey(id)) === expected) return true;
        } catch { /* Storage may be blocked by browser settings. */ }
    }
    return false;
}

export async function rememberTemplateUnlock(id: string, password: string): Promise<boolean> {
    currentPageUnlocks.set(id, password);
    const value = await fingerprint(id, password);
    if (!value) return false;
    let persisted = false;
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
        try {
            window[kind].setItem(unlockKey(id), value);
            if (kind === 'localStorage') persisted = true;
        } catch { /* Keep this page usable even if storage is unavailable/full. */ }
    }
    return persisted;
}
