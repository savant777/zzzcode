// Prefer the typed Latin key; fall back to its physical position for Thai layouts.
export function bbcodeShortcutKey(key: string, code: string): string | null {
    const supported = ['b', 'i', 'u', 'z', 'y'];
    const typed = key.toLowerCase();
    if (supported.includes(typed)) return typed;
    const physical = /^Key([BIUZY])$/.exec(code)?.[1].toLowerCase();
    return physical || null;
}
