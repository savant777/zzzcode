"use client";
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import TemplateGroupContainer from './TemplateGroupContainer';

export default function TemplateBlockContainer({ blockName, groups, sensors, onFieldDragEnd, onGroupDragEnd, onEdit }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
        id: blockName 
    });

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
                ${blockName === "GLOBAL" ? 'border-white/10' : 'border-(--primary)/30 hover:border-(--primary)/50'}
                ${isDragging ? 'border-(--primary) bg-black/40' : ''}
            `}
        >
            {/* Block Header (Drag Handle) */}
            <div 
                {...attributes} 
                {...listeners}
                className={`
                    absolute -top-3 left-4 px-3 py-1 text-[10px] font-black uppercase tracking-widest cursor-grab active:cursor-grabbing shadow-lg flex items-center gap-2
                    ${blockName === "GLOBAL" ? 'bg-zinc-800 text-white/40' : 'bg-(--primary) text-(--background)'}
                `}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 9h14M5 15h14" />
                </svg>
                {blockName === "GLOBAL" ? "Standard_Fields" : `BLOCK_SCOPE: ${blockName}`}
            </div>

            {/* SortableContext for Group in each Block */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onGroupDragEnd(e, blockName)}>
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
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}