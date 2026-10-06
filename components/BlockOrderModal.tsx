"use client";

import { useEffect, useRef, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { blockSummary, type BlockItem } from '@/lib/block-editor';

function Row({ item }: { item: BlockItem }) {
    const locked = item.fields.some(field => field.block_sortable === false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: locked });
    return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 1 : undefined }}
        className="flex items-center gap-2 border border-(--primary)/30 bg-(--background) p-2">
        <button type="button" {...attributes} {...listeners} disabled={locked} aria-label={`ลาก ${item.blockName} #${item.index + 1}`}
            className="h-11 w-11 shrink-0 touch-none cursor-grab border border-(--primary)/30 text-xl disabled:opacity-40">{locked ? '🔒' : '⠿'}</button>
        <div className="min-w-0"><div className="text-xs font-bold text-(--primary)">{item.blockName} #{item.index + 1}</div>
            <p className="truncate text-xs opacity-70">{blockSummary(item) || 'ไม่มีข้อความ'}</p></div>
    </li>;
}

export default function BlockOrderModal({ title, items, onClose, onApply }: {
    title: string; items: BlockItem[]; onClose: () => void; onApply: (ids: string[]) => void;
}) {
    const [order, setOrder] = useState(items);
    const dialog = useRef<HTMLDialogElement>(null);
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    useEffect(() => {
        const element = dialog.current!;
        const previousOverflow = document.body.style.overflow;
        element.showModal();
        document.body.style.overflow = 'hidden';
        return () => { element.close(); document.body.style.overflow = previousOverflow; };
    }, []);
    return <dialog ref={dialog} aria-labelledby="block-order-title" onCancel={onClose}
        onKeyDown={event => { if (event.ctrlKey || event.metaKey) event.stopPropagation(); }}
        className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85dvh] border border-(--primary) bg-(--background) p-0 text-(--foreground) backdrop:bg-black/70">
        <div className="flex max-h-[85dvh] flex-col p-4">
            <div className="flex items-center justify-between gap-2"><h2 id="block-order-title" className="min-w-0 truncate text-sm text-(--primary)">จัดลำดับ · {title}</h2>
                <button type="button" onClick={onClose} aria-label="ปิดการจัดลำดับ" className="h-11 w-11">✕</button></div>
            <p className="mb-3 text-xs opacity-60">ลากที่จับเพื่อย้ายรายการ · แป้นพิมพ์ใช้ Space เพื่อจับและวาง</p>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id) return;
                    setOrder(previous => {
                        const movable = previous.filter(item => !item.fields.some(f => f.block_sortable === false));
                        const from = movable.findIndex(item => item.id === active.id), to = movable.findIndex(item => item.id === over.id);
                        if (from < 0 || to < 0) return previous;
                        const changed = arrayMove(movable, from, to);
                        let cursor = 0;
                        return previous.map(item => item.fields.some(f => f.block_sortable === false) ? item : changed[cursor++]);
                    });
                }}>
                    <SortableContext items={order.map(item => item.id)} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2 p-1">{order.map(item => <Row key={item.id} item={item} />)}</ul>
                    </SortableContext>
                </DndContext>
            </div>
            <div className="mt-4 flex gap-3"><button type="button" onClick={onClose} className="min-h-11 flex-1 border border-(--primary)/30">ยกเลิก</button>
                <button type="button" onClick={() => onApply(order.map(item => item.id))} className="min-h-11 flex-1 bg-(--primary) text-(--background)">ใช้ลำดับนี้</button></div>
        </div>
    </dialog>;
}
