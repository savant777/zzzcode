"use client";
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import TemplateFieldItem from './TemplateFieldItem';

export default function TemplateGroupContainer({ id, groupName, gIdx, groupFields, onFieldDragEnd, onEdit, sensors }: any) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex flex-col gap-2 mb-2">
            {/* Drag Handle */}
            <div 
                {...attributes} 
                {...listeners} 
                className="flex items-center gap-2 px-2 py-1 bg-(--primary)/5 border-l-2 border-(--primary) cursor-grab active:cursor-grabbing hover:bg-(--primary)/10 transition-colors"
            >
                <span className="text-[10px] font-black opacity-30">#{gIdx + 1}</span>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--primary)">
                    {groupName}
                </h4>
            </div>

            {/* Drag Area */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onFieldDragEnd(e, groupName)}>
                <SortableContext items={groupFields.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2 pl-2">
                        {groupFields.map((field: any) => (
                            <TemplateFieldItem key={field.id} field={field} onEdit={onEdit} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}