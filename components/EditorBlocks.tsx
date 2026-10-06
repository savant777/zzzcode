"use client";

import { useEffect, useState } from 'react';
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
const buttonStyle = 'inline-flex h-6 items-center justify-center border border-(--primary)/30 px-3 text-[10px] leading-none uppercase text-(--primary) cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed';
const scopeButtonStyle = 'inline-flex h-6 items-center justify-center border border-(--primary)/30 px-3 text-[10px] leading-none text-(--primary) cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed';
const actionPaths = {
    copy: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h167q11-35 43-57.5t70-22.5q40 0 71.5 22.5T594-840h166q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560h-80v120H280v-120h-80v560Zm308.5-571.5Q520-783 520-800t-11.5-28.5Q497-840 480-840t-28.5 11.5Q440-817 440-800t11.5 28.5Q463-760 480-760t28.5-11.5Z',
    duplicate: 'M520-400h80v-120h120v-80H600v-120h-80v120H400v80h120v120ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z',
    remove: 'm256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    collapse: 'm356-160-56-56 180-180 180 180-56 56-124-124-124 124Zm124-404L300-744l56-56 124 124 124-124 56 56-180 180Z',
    expand: 'M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z',
    reorder: 'M160-501q0 71 47.5 122T326-322l-62-62 56-56 160 160-160 160-56-56 64-64q-105-6-176.5-81T80-500q0-109 75.5-184.5T340-760h140v80H340q-75 0-127.5 52T160-501Zm400 261v-80h320v80H560Zm0-220v-80h320v80H560Zm0-220v-80h320v80H560Z',
};
function ActionLabel({ action, label }: { action: keyof typeof actionPaths; label: string }) {
    return <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" className="h-4 w-4 sm:hidden"><path d={actionPaths[action]} /></svg><span className="hidden sm:inline">{label}</span></>;
}

export default function EditorBlocks(props: EditorBlocksProps) {
    const { fields, values, blueprint, setValues } = props;
    const [sorting, setSorting] = useState<BlockScope | null>(null);
    const [addMenu, setAddMenu] = useState<string | null>(null);
    useEffect(() => {
        if (!addMenu) return;
        const closeOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest('[data-block-add]')?.getAttribute('data-block-add') !== addMenu) setAddMenu(null);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [addMenu]);
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
        const allCollapsed = items.length > 0 && items.every(item => !!item.entry[BLOCK_COLLAPSED]);
        const scopeKey = JSON.stringify([scope.parentId || 'root', scope.groupName || '', scope.blockName || '']);
        const canAddName = (name: string) => canAddBlock(scopedFields.filter(f => f.block_name === name), items.filter(item => item.blockName === name).length);
        return <section key={`${scope.parentId || 'root'}:${title}`} aria-label={`${scope.groupName ? 'GBLOCK' : 'BLOCK'} ${title}`}
            className="min-w-0 border border-dashed border-(--primary)/40 p-3">
            <div className="flex items-center gap-2 border-b border-(--primary)/30 pb-2 mb-3">
                <h4 className="min-w-0 flex-1 break-words text-xs font-bold text-(--primary)">{scope.groupName ? 'GBLOCK' : 'BLOCK'}: {title} <span className="opacity-50">({items.length})</span></h4>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {items.filter(item => !item.fields.some(f => f.block_sortable === false)).length > 1 &&
                        <button type="button" className={scopeButtonStyle} aria-label="Reorder" title="Reorder" onClick={() => setSorting(scope)}><ActionLabel action="reorder" label="Reorder" /></button>}
                    <button type="button" className={scopeButtonStyle} disabled={!items.length} aria-label={allCollapsed ? 'Expand All' : 'Collapse All'} title={allCollapsed ? 'Expand All' : 'Collapse All'}
                        onClick={() => setValues(prev => collapseBlockItems(prev, items.map(item => item.id), !allCollapsed))}>
                        <ActionLabel action={allCollapsed ? 'expand' : 'collapse'} label={allCollapsed ? 'Expand All' : 'Collapse All'} />
                    </button>
                    <div className="relative flex items-center" data-block-add={scopeKey} onKeyDown={event => { if (event.key === 'Escape') setAddMenu(null); }}>
                        <button type="button" className="ml-auto inline-flex h-6 items-center justify-center cursor-pointer border border-transparent bg-(--primary) text-(--background) px-3 text-[10px] leading-none font-black uppercase hover:brightness-110 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                            aria-label="Add" title="Add" aria-expanded={names.length > 1 ? addMenu === scopeKey : undefined}
                            disabled={!names.some(canAddName)} onClick={() => {
                                if (names.length === 1) props.onAdd(names[0], scope.parentBlockName, parentIndex);
                                else setAddMenu(previous => previous === scopeKey ? null : scopeKey);
                            }}><ActionLabel action="add" label="Add" /></button>
                        {addMenu === scopeKey && names.length > 1 && <>
                            <div className="absolute right-0 top-full z-50 mt-2 min-w-32 max-w-[70vw] border border-(--primary)/40 bg-(--background) p-1 shadow-lg">
                                {names.map(name => <button key={name} type="button" disabled={!canAddName(name)}
                                    className="block w-full break-words px-3 py-2 text-left text-xs uppercase text-(--primary) hover:bg-(--primary)/10 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                                    onClick={() => { props.onAdd(name, scope.parentBlockName, parentIndex); setAddMenu(null); }}>{name}</button>)}
                            </div>
                        </>}
                    </div>
                </div>
            </div>
            {description && !scope.groupName && <p className="mb-3 whitespace-pre-wrap text-xs opacity-60">{description}</p>}
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
                    <div className="flex items-center gap-2">
                        <button type="button" aria-expanded={!collapsed} aria-controls={`block-fields-${item.id}`} onClick={() => setValues(prev => collapseBlockItems(prev, [item.id], !collapsed))}
                            className="flex min-w-0 flex-1 items-center text-left text-xs text-(--primary) cursor-pointer">
                            <span className="min-w-0"><span className="font-bold">{item.blockName} #{item.index + 1}</span>
                                <span className="mt-1 block truncate text-(--foreground)/60">{blockSummary(item) || 'ไม่มีข้อความ'}</span></span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                            <button type="button" className={buttonStyle} aria-label="Copy" title="Copy" onClick={async () => {
                                try { await navigator.clipboard.writeText(copyBlockHTML(blueprint, values, fields, scope, item.id)); toast.success('SYSTEM: BLOCK_COPIED_TO_CLIPBOARD'); }
                                catch { toast.error('CRITICAL_ERROR: Failed to copy'); }
                            }}><ActionLabel action="copy" label="Copy" /></button>
                            <button type="button" className={buttonStyle} aria-label="Duplicate" title="Duplicate" disabled={!canAddBlock(item.fields, count)} onClick={() => props.onDuplicate(item.blockName, item.index, scope.parentBlockName, parentIndex)}><ActionLabel action="duplicate" label="Duplicate" /></button>
                            <button type="button" className={buttonStyle + ' text-red-300'} aria-label="Remove" title="Remove" disabled={!canRemoveBlock(item.fields, count)} onClick={() => props.onRemove(item.blockName, item.index, scope.parentBlockName, parentIndex)}><ActionLabel action="remove" label="Remove" /></button>
                        </div>
                    </div>
                    <div id={`block-fields-${item.id}`} hidden={collapsed} className="mt-4">
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
