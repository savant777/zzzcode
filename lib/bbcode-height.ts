export const BBCODE_HEIGHTS = '__zzzcode_bbcode_heights';

export function getBBCodeHeights(source?: Record<string, any>): Record<string, number> {
    const values = source?.[BBCODE_HEIGHTS];
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    const result: Record<string, number> = {};
    for (const [key, height] of Object.entries(values)) {
        if (typeof height === 'number' && Number.isFinite(height) && height >= 76 && height <= 10000) result[key] = height;
    }
    return result;
}

export function updateBBCodeHeight(values: Record<string, any>, path: (string | number)[], key: string, height: number): Record<string, any> {
    if (!Number.isFinite(height) || height < 76 || height > 10000) return values;
    if (!path.length) {
        const previous = getBBCodeHeights(values);
        if (previous[key] === height) return values;
        return { ...values, [BBCODE_HEIGHTS]: { ...previous, [key]: height } };
    }
    const [head, ...tail] = path;
    if (!values[head] || typeof values[head] !== 'object') return values;
    const child = updateBBCodeHeight(values[head], tail, key, height);
    if (child === values[head]) return values;
    const next = Array.isArray(values) ? [...values] : { ...values };
    (next as any)[head] = child;
    return next;
}
