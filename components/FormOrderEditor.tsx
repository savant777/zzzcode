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
        className="flex min-w-0 items-center gap-3 border border-(--primary)/25 bg-(--background) p-2">
        <button type="button" {...attributes} {...listeners} aria-label={`ย้าย ${section.kind} ${section.name}`}
            className="h-11 w-11 shrink-0 touch-none cursor-grab border border-(--primary)/30 text-xl text-(--primary)">⠿</button>
        <div className="min-w-0"><span className="text-[10px] uppercase opacity-50">{section.kind === 'group' ? 'Field group' : section.kind}</span>
            <p className="break-words text-sm text-(--primary)">{section.name}</p></div>
    </li>;
}

export default function FormOrderEditor({ fields, onChange }: { fields: FieldConfig[]; onChange: (fields: FieldConfig[]) => void }) {
    const contextId = useId();
    const sections = getFormSections(fields);
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    return <details className="mb-5 border border-(--primary)/30 p-3">
        <summary className="min-h-11 cursor-pointer text-sm text-(--primary)">จัดลำดับฟอร์ม Editor</summary>
        <p className="mb-3 text-xs leading-relaxed opacity-60">ลากกลุ่มฟิลด์, BLOCK หรือ GBLOCK เพื่อเลือกตำแหน่งในฟอร์มกรอกข้อมูล การจัดตรงนี้ไม่เปลี่ยนลำดับเนื้อหาในโค้ด</p>
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
