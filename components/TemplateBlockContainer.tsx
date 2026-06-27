"use client";
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
    parentBlockName,
    isNested = false,
}: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
        id: parentBlockName ? `${parentBlockName}>${blockName}` : blockName,
        disabled: isNested,
    });
    const blockFields = Object.values(groups).flat() as any[];
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
                ${isNested ? 'ml-4 border-(--primary)/20' : ''}
                ${blockName === "GLOBAL" ? 'border-white/10' : 'border-(--primary)/30 hover:border-(--primary)/50'}
                ${isDragging ? 'border-(--primary) bg-black/40' : ''}
            `}
        >
            {/* Block Header (Drag Handle) */}
            <div 
                {...attributes} 
                {...listeners}
                className={`
                    absolute -top-3 left-4 px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2
                    ${isNested ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
                    ${blockName === "GLOBAL" ? 'bg-zinc-800 text-white/40' : isNested ? 'bg-black text-(--primary) border border-(--primary)/40' : 'bg-(--primary) text-(--background)'}
                `}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 9h14M5 15h14" />
                </svg>
                {blockName === "GLOBAL" ? "Standard_Fields" : isNested ? `NESTED_BLOCK: ${blockName}` : `BLOCK_SCOPE: ${blockName}`}
            </div>

            {blockName !== "GLOBAL" && (
                <div className="mb-3 flex flex-col gap-1">
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onGroupDragEnd(e, blockName, parentBlockName)}>
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
                <div className="mt-4 border-t border-(--primary)/15 pt-5">
                    <div className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-(--foreground)/35">
                        Nested_Blocks
                    </div>
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
                                        parentBlockName={blockName}
                                        isNested
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );
}
