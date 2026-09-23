// Local diagnostics deliberately exclude tokens, user IDs, messages and form data.
export function recordAuthEvent(event: string) {
    try {
        const key = 'zzzcode_auth_events';
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const entries = Array.isArray(stored) ? stored.slice(-29) : [];
        entries.push({ time: new Date().toISOString(), event });
        localStorage.setItem(key, JSON.stringify(entries));
    } catch { /* Diagnostics must never interrupt the editor. */ }
}
