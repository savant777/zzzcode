import { generateFinalHTML, type FieldConfig } from './template-parser';
import { BLOCK_ENTRY_ID, BLOCK_GROUPS, reconcileBlockGroups } from './block-state';

export const BLOCK_COLLAPSED = '__zzzcode_collapsed';
export type BlockScope = { blockName?: string; groupName?: string; parentBlockName?: string; parentId?: string };
export type BlockItem = { id: string; blockName: string; entry: Record<string, any>; index: number; fields: FieldConfig[] };

export function blockItems(values: Record<string, any>, fields: FieldConfig[], scope: BlockScope): BlockItem[] {
    const container = scope.parentBlockName
        ? values[scope.parentBlockName]?.find((entry: any) => entry[BLOCK_ENTRY_ID] === scope.parentId) : values;
    if (!container) return [];
    const matching = fields.filter(f => f.parent_block_name === scope.parentBlockName && f.block_name &&
        (scope.groupName ? f.block_group_name === scope.groupName : f.block_name === scope.blockName));
    const names = [...new Set(matching.sort((a, b) => (a.block_group_member_order ?? 0) - (b.block_group_member_order ?? 0)).map(f => f.block_name!))];
    const items = names.flatMap(blockName => (Array.isArray(container[blockName]) ? container[blockName] : [])
        .map((entry: Record<string, any>, index: number) => ({ id: entry[BLOCK_ENTRY_ID], blockName, entry, index, fields: matching.filter(f => f.block_name === blockName) })));
    if (scope.groupName) {
        const order = values[BLOCK_GROUPS]?.[scope.groupName] || [];
        const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? Infinity : index; };
        items.sort((a: BlockItem, b: BlockItem) => rank(a.id) - rank(b.id));
    }
    return items;
}

export function reorderBlockItems(values: Record<string, any>, fields: FieldConfig[], scope: BlockScope, ids: string[]) {
    const items = blockItems(values, fields, scope);
    if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(id => !items.some(item => item.id === id))) return values;
    // Locked items keep their exact slots, even when other items move across them.
    if (items.some((item, index) => item.fields.some(f => f.block_sortable === false) && ids[index] !== item.id)) return values;
    const ordered = ids.map(id => items.find(item => item.id === id)!);
    const arrays = Object.fromEntries([...new Set(items.map(item => item.blockName))]
        .map(name => [name, ordered.filter(item => item.blockName === name).map(item => item.entry)]));
    if (scope.parentBlockName) return { ...values, [scope.parentBlockName]: values[scope.parentBlockName].map((entry: any) =>
        entry[BLOCK_ENTRY_ID] === scope.parentId ? { ...entry, ...arrays } : entry) };
    const next = reconcileBlockGroups({ ...values, ...arrays }, fields);
    if (scope.groupName) next[BLOCK_GROUPS] = { ...next[BLOCK_GROUPS], [scope.groupName]: ids };
    return next;
}

export function collapseBlockItems(values: Record<string, any>, ids: string[], collapsed: boolean) {
    const selected = new Set(ids);
    const visit = (entry: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(entry).map(([key, value]) =>
        [key, Array.isArray(value) ? value.map(child => child && typeof child === 'object' && child[BLOCK_ENTRY_ID]
            ? { ...visit(child), ...(selected.has(child[BLOCK_ENTRY_ID]) ? { [BLOCK_COLLAPSED]: collapsed } : {}) } : child) : value]));
    return visit(values);
}

export function blockSummary(item: BlockItem): string {
    return item.fields.filter(f => f.type === 'text' || f.type === 'bbcode').map(f => item.entry[f.variable_name])
        .filter(value => typeof value === 'string' && value.trim()).join(' · ').replace(/<[^>]*>|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').slice(0, 100);
}

export function copyBlockHTML(blueprint: string, values: Record<string, any>, fields: FieldConfig[], scope: BlockScope, id: string): string {
    const item = blockItems(values, fields, scope).find(item => item.id === id);
    if (!item) throw new Error('ไม่พบรายการที่ต้องการคัดลอก');
    const stack: { name: string; start: number }[] = [];
    for (const token of blueprint.matchAll(/\[(\/?)BLOCK:([^\]]+)\]/g)) {
        if (!token[1]) stack.push({ name: token[2], start: token.index! + token[0].length });
        else {
            const open = stack.pop();
            if (!open || open.name !== token[2]) continue;
            if (open.name !== item.blockName || stack.at(-1)?.name !== scope.parentBlockName) continue;
            let fragment = `[BLOCK:${item.blockName}]${blueprint.slice(open.start, token.index)}[/BLOCK:${item.blockName}]`;
            let selection = { ...values, [item.blockName]: [item.entry] };
            if (scope.parentBlockName) {
                const parent = values[scope.parentBlockName].find((entry: any) => entry[BLOCK_ENTRY_ID] === scope.parentId);
                selection = { ...values, [scope.parentBlockName]: [{ ...parent, [item.blockName]: [item.entry] }] };
                fragment = `[BLOCK:${scope.parentBlockName}]${fragment}[/BLOCK:${scope.parentBlockName}]`;
            }
            return generateFinalHTML(fragment, selection, fields, false);
        }
    }
    throw new Error('ไม่พบ BLOCK ใน Blueprint');
}
