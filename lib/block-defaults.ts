import type { FieldConfig } from './template-parser';

export function defaultBlockCount(fields: FieldConfig[]): number {
    const value = fields.find(field => field.block_default_count !== undefined)?.block_default_count;
    const { min, max } = blockLimits(fields);
    return Math.min(max ?? Infinity, Math.max(min, countValue(value, 1)));
}

const countValue = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? Math.max(0, Math.trunc(value)) : fallback;

export function blockLimits(fields: FieldConfig[]) {
    const min = countValue(fields.find(f => f.block_min_count !== undefined)?.block_min_count, 0);
    const rawMax = fields.find(f => f.block_max_count !== undefined)?.block_max_count;
    const max = rawMax == null ? null : Math.max(min, countValue(rawMax, min));
    return { min, max };
}

export const canAddBlock = (fields: FieldConfig[], count: number) => {
    const { max } = blockLimits(fields);
    return max === null || count < max;
};
export const canRemoveBlock = (fields: FieldConfig[], count: number) => count > blockLimits(fields).min;
