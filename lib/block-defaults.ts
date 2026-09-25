import type { FieldConfig } from './template-parser';

export function defaultBlockCount(fields: FieldConfig[]): number {
    const value = fields.find(field => field.block_default_count !== undefined)?.block_default_count;
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(10, Math.trunc(value))) : 1;
}
