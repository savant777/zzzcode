import { syncFieldsFromHTML, type FieldConfig } from './template-parser';

export type FormSection = { id: string; kind: 'group' | 'block' | 'gblock'; name: string; fields: FieldConfig[] };
const sectionKey = (kind: FormSection['kind'], name: string) => JSON.stringify([kind, name]);

export function getFormSections(fields: FieldConfig[]): FormSection[] {
    const sections = new Map<string, FormSection>();
    // Legacy templates keep their existing groups-first Editor layout.
    const roots = [...fields.filter(f => !f.block_name).sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0)),
        ...fields.filter(f => f.block_name && !f.parent_block_name).sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0))];
    roots.forEach(field => {
        const kind = !field.block_name ? 'group' : field.block_group_name ? 'gblock' : 'block';
        const name = kind === 'group' ? field.group_name : kind === 'gblock' ? field.block_group_name! : field.block_name!;
        const id = sectionKey(kind, name);
        if (!sections.has(id)) sections.set(id, { id, kind, name, fields: [] });
        sections.get(id)!.fields.push(field);
    });
    const rank = (section: FormSection) => Math.min(...section.fields.map(f => Number.isFinite(f.form_section_order) ? f.form_section_order! : Infinity));
    return [...sections.values()].sort((a, b) => rank(a) - rank(b));
}

export function setFormSectionOrder(fields: FieldConfig[], ids: string[]): FieldConfig[] {
    const sections = getFormSections(fields);
    if (ids.length !== sections.length || new Set(ids).size !== ids.length || ids.some(id => !sections.some(s => s.id === id))) return fields;
    const orders = new Map<string, number>();
    sections.forEach(section => section.fields.forEach(field => orders.set(field.id, ids.indexOf(section.id))));
    return fields.map(field => orders.has(field.id) ? { ...field, form_section_order: orders.get(field.id) } : field);
}

// Field sync must preserve layout even when the last original field of a section
// is replaced. Deleted sections disappear; new sections append to a saved layout.
export function syncFormFields(blueprint: string, previous: FieldConfig[], initializeNew = false): FieldConfig[] {
    const fields = syncFieldsFromHTML(blueprint, previous);
    const sections = getFormSections(fields);
    const previousSections = getFormSections(previous);
    if (previous.some(field => field.form_section_order !== undefined)) {
        const retained = previousSections.map(s => s.id).filter(id => sections.some(s => s.id === id));
        return setFormSectionOrder(fields, [...retained, ...sections.map(s => s.id).filter(id => !retained.includes(id))]);
    }
    if (!initializeNew) return fields;
    // Scope-aware token scan: identical variable/group names inside a BLOCK must
    // never determine the position of a global field group.
    const positions = new Map<string, number>();
    const stack: string[] = [];
    const tokens = /\[(\/)?(GBLOCK|BLOCK):([^\]]+)\]|\{\{([^}:[\]]+)(?::[^}]*?)?(?:\[GROUP:[^\]]+\])?\}\}|\[REPEAT:([^\]]+)\]/g;
    for (const token of blueprint.matchAll(tokens)) {
        if (token[2]) {
            if (token[1]) stack.pop();
            else {
                if (!stack.length) {
                    const id = sectionKey(token[2] === 'GBLOCK' ? 'gblock' : 'block', token[3]);
                    if (!positions.has(id)) positions.set(id, token.index!);
                }
                stack.push(token[3]);
            }
        } else if (!stack.length) {
            const name = (token[4] || token[5])?.trim();
            const field = fields.find(f => !f.block_name && f.variable_name === name);
            if (field) {
                const id = sectionKey('group', field.group_name);
                if (!positions.has(id)) positions.set(id, token.index!);
            }
        }
    }
    sections.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
    return setFormSectionOrder(fields, sections.map(s => s.id));
}
