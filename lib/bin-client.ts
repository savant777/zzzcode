export function binHeaders(): Record<string, string> {
    try { const token = localStorage.getItem('zzzcode_bin'); return token && /^v2-[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token) ? { 'X-Bin-Token': token } : {}; } catch { return {}; }
}
