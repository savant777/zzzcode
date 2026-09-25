// Remember a template-bound credential, never the plaintext password.
// Presence in storage grants nothing: the server verifies it on every protected read.
const currentPageUnlocks = new Map<string, string>();
const unlockKey = (id: string) => `zzzcode_template_unlock_v1_${id}`;

// This fingerprint is a credential: send it only to our verification endpoint.
export async function getRememberedTemplateUnlock(id: string): Promise<string | null> {
    const remembered = currentPageUnlocks.get(id);
    if (remembered !== undefined) return remembered;
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
        try {
            const value = window[kind].getItem(unlockKey(id));
            if (value && /^[a-f0-9]{64}$/.test(value)) return value;
        } catch { /* Storage may be blocked. */ }
    }
    return null;
}

async function fingerprint(id: string, password: string): Promise<string | null> {
    try {
        const bytes = new TextEncoder().encode(JSON.stringify([id, password]));
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
        return null;
    }
}

export async function rememberTemplateUnlock(id: string, password: string): Promise<boolean> {
    const value = await fingerprint(id, password);
    if (!value) return false;
    currentPageUnlocks.set(id, value);
    let persisted = false;
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
        try {
            window[kind].setItem(unlockKey(id), value);
            if (kind === 'localStorage') persisted = true;
        } catch { /* Keep this page usable even if storage is unavailable/full. */ }
    }
    return persisted;
}
