"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import type { FieldConfig } from '@/lib/template-parser';
import { BLOCK_ENTRY_ID } from '@/lib/block-state';
import { blockItems, blockSummary, collapseBlockItems, copyBlockHTML, reorderBlockItems, BLOCK_COLLAPSED, type BlockScope } from '@/lib/block-editor';
import { canAddBlock, canRemoveBlock } from '@/lib/block-defaults';
import { getBBCodeHeights, updateBBCodeHeight } from '@/lib/bbcode-height';
import FieldRenderer from './FieldRenderer';
import BlockOrderModal from './BlockOrderModal';

type Values = Record<string, any>;
export type EditorBlocksProps = {
    scope?: BlockScope;
    fields: FieldConfig[]; values: Values; blueprint: string;
    setValues: (update: (previous: Values) => Values) => void;
    transactValues: (update: (previous: Values) => Values) => void;
    onAdd: (name: string, parent?: string, parentIndex?: number) => void;
    onDuplicate: (name: string, index: number, parent?: string, parentIndex?: number) => void;
    onRemove: (name: string, index: number, parent?: string, parentIndex?: number) => void;
    onValue: (name: string, index: number, variable: string, value: any, parent?: string, parentIndex?: number) => void;
};
const buttonStyle = 'min-h-11 border border-(--primary)/30 px-3 text-xs text-(--primary) cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed';

export default function EditorBlocks(props: EditorBlocksProps) {
    const { fields, values, blueprint, setValues } = props;
    const [sorting, setSorting] = useState<BlockScope | null>(null);
    const roots = [...fields].filter(f => f.block_name && !f.parent_block_name).sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0));
    const scopes: BlockScope[] = [];
    roots.forEach(field => {
        const scope = field.block_group_name ? { groupName: field.block_group_name } : { blockName: field.block_name };
        if (!scopes.some(item => item.groupName === scope.groupName && item.blockName === scope.blockName)) scopes.push(scope);
    });

    const renderScope = (scope: BlockScope) => {
        const items = blockItems(values, fields, scope);
        const scopedFields = fields.filter(f => f.block_name && f.parent_block_name === scope.parentBlockName &&
            (scope.groupName ? f.block_group_name === scope.groupName : f.block_name === scope.blockName));
        const names = [...new Set(scopedFields.map(f => f.block_name!))];
        const parentIndex = scope.parentBlockName ? values[scope.parentBlockName]?.findIndex((entry: Values) => entry[BLOCK_ENTRY_ID] === scope.parentId) : undefined;
        const title = scope.groupName || scope.blockName!;
        const description = scopedFields.find(f => f.block_description)?.block_description;
        return <section key={`${scope.parentId || 'root'}:${title}`} aria-label={`${scope.groupName ? 'GBLOCK' : 'BLOCK'} ${title}`}
            className="min-w-0 border border-dashed border-(--primary)/40 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-(--primary)/25 pb-3">
                <h4 className="min-w-0 flex-1 break-words text-xs font-bold text-(--primary)">{scope.groupName ? 'GBLOCK' : 'BLOCK'}: {title} <span className="opacity-50">({items.length})</span></h4>
                <div className="flex flex-wrap gap-2">{names.map(name => {
                    const config = scopedFields.filter(f => f.block_name === name);
                    return <button key={name} type="button" className={buttonStyle} disabled={!canAddBlock(config, items.filter(item => item.blockName === name).length)}
                        onClick={() => props.onAdd(name, scope.parentBlockName, parentIndex)}>Add{scope.groupName ? ` ${name}` : ''}</button>;
                })}</div>
            </div>
            {description && !scope.groupName && <p className="mb-3 whitespace-pre-wrap text-xs opacity-60">{description}</p>}
            <div className="mb-3 flex flex-wrap gap-2">
                {items.filter(item => !item.fields.some(f => f.block_sortable === false)).length > 1 && <button type="button" className={buttonStyle} onClick={() => setSorting(scope)}>จัดลำดับ</button>}
                <button type="button" className={buttonStyle} disabled={!items.length} onClick={() => setValues(prev => collapseBlockItems(prev, items.map(item => item.id), true))}>ยุบทั้งหมด</button>
                <button type="button" className={buttonStyle} disabled={!items.length} onClick={() => setValues(prev => collapseBlockItems(prev, items.map(item => item.id), false))}>ขยายทั้งหมด</button>
            </div>
            {!items.length && <p className="p-3 text-center text-xs opacity-40">ยังไม่มีรายการ</p>}
            <div className="flex flex-col gap-3">{items.map(item => {
                const collapsed = !!item.entry[BLOCK_COLLAPSED];
                const groups = new Map<string, FieldConfig[]>();
                [...item.fields].sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0) || (a.field_order ?? 0) - (b.field_order ?? 0)).forEach(field => {
                    if (!groups.has(field.group_name)) groups.set(field.group_name, []);
                    groups.get(field.group_name)!.push(field);
                });
                const count = items.filter(other => other.blockName === item.blockName).length;
                const childNames = !scope.parentBlockName ? [...new Set(fields.filter(f => f.parent_block_name === item.blockName).sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0)).map(f => f.block_name!))] : [];
                const path = scope.parentBlockName ? [scope.parentBlockName, parentIndex!, item.blockName, item.index] : [item.blockName, item.index];
                return <article key={item.id} className="min-w-0 border border-(--primary)/20 bg-black/20 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button type="button" aria-expanded={!collapsed} aria-controls={`block-fields-${item.id}`} onClick={() => setValues(prev => collapseBlockItems(prev, [item.id], !collapsed))}
                            className="flex min-h-11 min-w-0 basis-full sm:basis-0 flex-1 items-center gap-2 text-left text-xs text-(--primary)">
                            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span><span className="min-w-0"><span className="font-bold">{item.blockName} #{item.index + 1}</span>
                                <span className="mt-1 block truncate text-(--foreground)/60">{blockSummary(item) || 'ไม่มีข้อความ'}</span></span>
                        </button>
                        <div className="flex flex-wrap gap-1">
                            <button type="button" className={buttonStyle} onClick={async () => {
                                try { await navigator.clipboard.writeText(copyBlockHTML(blueprint, values, fields, scope, item.id)); toast.success('คัดลอกโค้ด BLOCK แล้ว'); }
                                catch (error) { toast.error(error instanceof Error ? error.message : 'คัดลอกไม่สำเร็จ'); }
                            }}>Copy</button>
                            <button type="button" className={buttonStyle} disabled={!canAddBlock(item.fields, count)} onClick={() => props.onDuplicate(item.blockName, item.index, scope.parentBlockName, parentIndex)}>Duplicate</button>
                            <button type="button" className={buttonStyle + ' text-red-300'} disabled={!canRemoveBlock(item.fields, count)} onClick={() => props.onRemove(item.blockName, item.index, scope.parentBlockName, parentIndex)}>Remove</button>
                        </div>
                    </div>
                    <div id={`block-fields-${item.id}`} hidden={collapsed}>
                        {scope.groupName && item.fields.find(f => f.block_description)?.block_description && <p className="mb-3 whitespace-pre-wrap text-xs opacity-60">{item.fields.find(f => f.block_description)?.block_description}</p>}
                        <div className="flex flex-col gap-4">{[...groups].map(([group, groupFields]) => <div key={group}>
                            <h5 className="mb-3 border-l-2 border-(--primary) bg-(--primary)/5 px-2 py-1 text-xs font-bold uppercase text-(--primary)">{group}</h5>
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{groupFields.map((field, index) => <FieldRenderer key={field.id} field={field} value={item.entry[field.variable_name]}
                                bbcodeHeights={getBBCodeHeights(item.entry)} onBBCodeHeightChange={(key, height) => setValues(prev => updateBBCodeHeight(prev, path, key, height))}
                                onChange={(variable, value) => props.onValue(item.blockName, item.index, variable, value, scope.parentBlockName, parentIndex)}
                                className={field.type === 'bbcode' || (groupFields.length % 2 !== 0 && index === 0) ? 'lg:col-span-2' : ''} />)}</div>
                        </div>)}
                            {childNames.map(blockName => renderScope({ blockName, parentBlockName: item.blockName, parentId: item.id }))}
                        </div>
                    </div>
                </article>;
            })}</div>
        </section>;
    };
    return <>{(props.scope ? [props.scope] : scopes).map(renderScope)}{sorting && <BlockOrderModal title={sorting.groupName || sorting.blockName!}
        items={blockItems(values, fields, sorting)} onClose={() => setSorting(null)} onApply={ids => {
            props.transactValues(prev => reorderBlockItems(prev, fields, sorting, ids)); setSorting(null);
        }} />}</>;
}
