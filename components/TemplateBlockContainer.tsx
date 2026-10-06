"use client";
import { useId } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { defaultBlockCount, blockLimits } from '@/lib/block-defaults';
import BlockDefaultValues from './BlockDefaultValues';
import TemplateGroupContainer from './TemplateGroupContainer';

export default function TemplateBlockContainer({
    blockName,
    groups,
    childBlocks = [],
    sensors,
    onFieldDragEnd,
    onGroupDragEnd,
    onEdit,
    onBlockDescriptionChange,
    onBlockDefaultCountChange,
    onBlockLimitsChange,
    onBlockDefaultValueChange,
    parentBlockName,
    isNested = false,
    disableSort = false,
}: any) {
    const contextId = useId();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
        id: parentBlockName ? `${parentBlockName}>${blockName}` : blockName,
        disabled: isNested || disableSort,
    });
    const blockFields = Object.values(groups).flat() as any[];
    const limits = blockLimits(blockFields);
    const sortable = blockFields[0]?.block_sortable ?? true;
    const blockDescription = blockFields[0]?.block_description || '';

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`
                first:mt-3 mb-4 border-2 border-dashed p-4 pt-6 relative bg-black/20 transition-colors
                ${isNested ? 'border-(--primary)/20' : ''}
                ${blockName === "GLOBAL" ? 'border-white/10' : 'border-(--primary)/30 hover:border-(--primary)/50'}
                ${isDragging ? 'border-(--primary) bg-black/40' : ''}
            `}
        >
            {/* Block Header (Drag Handle) */}
            <div 
                {...(disableSort || isNested ? {} : attributes)}
                {...(disableSort || isNested ? {} : listeners)}
                className={`
                    absolute -top-3 left-4 px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2
                    ${isNested || disableSort ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
                    ${blockName === "GLOBAL" ? 'bg-zinc-800 text-white/40' : isNested ? 'bg-black text-(--primary) border border-(--primary)/40' : 'bg-(--primary) text-(--background)'}
                `}
            >
                {!disableSort && !isNested && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 9h14M5 15h14" />
                </svg>}
                {blockName === "GLOBAL" ? "Standard_Fields" : isNested ? `NESTED_BLOCK: ${blockName}` : `BLOCK_SCOPE: ${blockName}`}
            </div>

            {blockName !== "GLOBAL" && (
                <div className="mb-3 flex flex-col gap-1">
                    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-x-2 gap-y-2 text-xs sm:flex sm:flex-wrap [--limit-input-width:clamp(3rem,18vw,6rem)] sm:[--limit-input-width:6rem]">
                        <label className="flex min-w-0 items-center gap-2"><span className="w-[7ch] shrink-0 sm:w-auto">Min</span> <input type="number" min={0} step={1} value={limits.min}
                            onChange={event => {
                                const min = Number(event.target.value);
                                if (Number.isSafeInteger(min) && min >= 0) onBlockLimitsChange?.(blockName, min, limits.max === null ? null : Math.max(min, limits.max), sortable, parentBlockName);
                            }} className="min-w-0 w-(--limit-input-width) shrink bg-black border border-(--primary)/30 p-1" /></label>
                        <label className="flex min-w-0 items-center gap-2">Max <input type="number" min={limits.min} step={1} value={limits.max ?? ''} placeholder="Unlimited"
                            onChange={event => {
                                const max = event.target.value === '' ? null : Number(event.target.value);
                                if (max === null || (Number.isSafeInteger(max) && max >= limits.min)) onBlockLimitsChange?.(blockName, limits.min, max, sortable, parentBlockName);
                            }} className="min-w-0 w-(--limit-input-width) shrink bg-black border border-(--primary)/30 p-1" /></label>
                        <label className="flex min-w-0 items-center gap-2"><span className="w-[7ch] shrink-0 sm:w-auto">Initial</span>
                            <input type="number" min={limits.min} max={limits.max ?? undefined} step={1}
                                value={defaultBlockCount(blockFields)}
                                onChange={event => {
                                    const value = Number(event.target.value);
                                    if (Number.isSafeInteger(value)) onBlockDefaultCountChange?.(blockName, Math.min(limits.max ?? Infinity, Math.max(limits.min, value)), parentBlockName);
                                }}
                                className="min-w-0 w-(--limit-input-width) shrink bg-black border border-(--primary)/30 p-1 text-(--primary)" />
                        </label>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={sortable} className="peer sr-only"
                                onChange={event => onBlockLimitsChange?.(blockName, limits.min, limits.max, event.target.checked, parentBlockName)} />
                            <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center border border-(--primary)/30 bg-black/30 peer-checked:[&>span]:bg-(--primary) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--primary)">
                                <span className="h-2 w-2" />
                            </span>
                            <span className="whitespace-nowrap text-[10px] sm:text-xs">Allow reordering</span>
                        </label>
                    </div>
                    <BlockDefaultValues fields={blockFields} onChange={onBlockDefaultValueChange} />
                    <label className="text-[9px] uppercase tracking-[0.2em] text-(--foreground)/35">
                        Block_Description
                    </label>
                    <textarea
                        rows={2}
                        value={blockDescription}
                        onChange={(e) => onBlockDescriptionChange?.(blockName, e.target.value, parentBlockName)}
                        className="font-Google-Sans bg-black/30 border border-(--primary)/20 p-2 text-xs outline-none focus:border-(--primary)/50 resize-y"
                        placeholder="Optional helper text for this repeatable block..."
                    />
                </div>
            )}

            {/* SortableContext for Group in each Block */}
            <DndContext id={`${contextId}-groups`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onGroupDragEnd(e, blockName, parentBlockName)}>
                <SortableContext items={Object.keys(groups)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                        {Object.entries(groups).map(([groupName, fields]: any, gIdx) => (
                            <TemplateGroupContainer 
                                key={groupName}
                                id={groupName}
                                groupName={groupName}
                                gIdx={gIdx}
                                groupFields={fields}
                                sensors={sensors}
                                onFieldDragEnd={onFieldDragEnd}
                                onEdit={onEdit}
                                blockName={blockName}
                                parentBlockName={parentBlockName}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {childBlocks.length > 0 && (
                <div className="flex flex-col gap-2">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={() => undefined}>
                        <SortableContext items={childBlocks.map((childBlock: any) => `${blockName}>${childBlock.blockName}`)} strategy={verticalListSortingStrategy}>
                            {childBlocks.map((childBlock: any) => (
                                <TemplateBlockContainer
                                    key={`${blockName}-${childBlock.blockName}`}
                                    blockName={childBlock.blockName}
                                    groups={childBlock.groups}
                                    childBlocks={childBlock.childBlocks}
                                    sensors={sensors}
                                    onFieldDragEnd={onFieldDragEnd}
                                    onGroupDragEnd={onGroupDragEnd}
                                    onEdit={onEdit}
                                    onBlockDescriptionChange={onBlockDescriptionChange}
                                    onBlockLimitsChange={onBlockLimitsChange}
                                    onBlockDefaultCountChange={onBlockDefaultCountChange}
                                    onBlockDefaultValueChange={onBlockDefaultValueChange}
                                    parentBlockName={blockName}
                                    isNested
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            )}
        </div>
    );
}
