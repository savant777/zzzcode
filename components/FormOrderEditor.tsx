"use client";
import { useId } from 'react';

import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getFormSections, setFormSectionOrder, type FormSection } from '@/lib/form-layout';
import type { FieldConfig } from '@/lib/template-parser';

function SectionRow({ section }: { section: FormSection }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
    return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : undefined }}
        className="flex min-w-0 items-center gap-2 border border-(--primary)/25 bg-(--background) p-2">
        <button type="button" {...attributes} {...listeners} aria-label={`ย้าย ${section.kind} ${section.name}`}
            className="h-11 w-5 shrink-0 touch-none cursor-grab text-xl text-(--primary) active:cursor-grabbing">⋮</button>
        <div className="min-w-0"><span className="block text-[10px] uppercase leading-tight text-(--primary) opacity-60">{section.kind === 'group' ? 'FIELD GROUP' : section.kind}</span>
            <p className="break-words text-sm font-bold leading-snug">{section.name}</p></div>
    </li>;
}

export default function FormOrderEditor({ fields, onChange }: { fields: FieldConfig[]; onChange: (fields: FieldConfig[]) => void }) {
    const contextId = useId();
    const sections = getFormSections(fields);
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    return <details className="mb-5 border border-(--primary)/30 p-3">
        <summary className="cursor-pointer text-sm text-(--primary)">Rearrange Form Order</summary>
        <p className="mt-2 mb-3 text-xs leading-relaxed opacity-60">ลาก FIELD GROUP, BLOCK หรือ GBLOCK เพื่อจัดลำดับการแสดงผลในหน้า Editor</p>
        <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return;
            const ids = sections.map(section => section.id);
            const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
            if (from >= 0 && to >= 0) onChange(setFormSectionOrder(fields, arrayMove(ids, from, to)));
        }}>
            <SortableContext items={sections.map(section => section.id)} strategy={verticalListSortingStrategy}>
                <ol aria-label="ลำดับส่วนในฟอร์ม Editor" className="flex flex-col gap-2">{sections.map(section => <SectionRow key={section.id} section={section} />)}</ol>
            </SortableContext>
        </DndContext>
    </details>;
}
