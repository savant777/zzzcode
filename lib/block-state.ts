import type { FieldConfig } from './template-parser';

export const BLOCK_ENTRY_ID = '__zzzcode_entry_id';
export const BLOCK_GROUPS = '__zzzcode_groups';

// Retain the legacy arrays and field values; metadata is additive and JSON-safe.
export function renewBlockIds(entry: Record<string, any>): Record<string, any> {
    const copy = structuredClone(entry);
    const visit = (item: Record<string, any>) => {
        if (typeof item[BLOCK_ENTRY_ID] === 'string') {
            item[BLOCK_ENTRY_ID] = crypto.randomUUID();
            item.__zzzcode_collapsed = false;
        }
        Object.values(item).forEach(value => {
            if (Array.isArray(value)) value.forEach(child => {
                if (child && typeof child === 'object' && typeof child[BLOCK_ENTRY_ID] === 'string') visit(child);
            });
        });
    };
    visit(copy);
    return copy;
}

export function reconcileBlockGroups(values: Record<string, any>, fields: FieldConfig[], afterId?: string, insertedId?: string) {
    const groups: Record<string, string[]> = {};
    const members = new Map<string, Set<string>>();
    [...fields].sort((a, b) => (a.block_group_member_order ?? 0) - (b.block_group_member_order ?? 0)).forEach(field => {
        if (!field.parent_block_name && field.block_name && field.block_group_name) {
            if (!members.has(field.block_group_name)) members.set(field.block_group_name, new Set());
            members.get(field.block_group_name)!.add(field.block_name);
        }
    });
    members.forEach((blocks, group) => {
        const ids = [...blocks].flatMap(name => (Array.isArray(values[name]) ? values[name] : [])
            .map((entry: any) => entry[BLOCK_ENTRY_ID]).filter((id: any) => typeof id === 'string'));
        const saved = values[BLOCK_GROUPS]?.[group];
        const order: string[] = Array.isArray(saved) ? [...new Set<string>(saved.filter((id: string) => ids.includes(id)))] : [];
        ids.forEach(id => { if (!order.includes(id)) order.push(id); });
        if (afterId && insertedId && order.includes(afterId) && order.includes(insertedId)) {
            order.splice(order.indexOf(insertedId), 1);
            order.splice(order.indexOf(afterId) + 1, 0, insertedId);
        }
        groups[group] = order;
    });
    return { ...values, [BLOCK_GROUPS]: groups };
}
