"use client";

import { useEffect, useRef, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { blockSummary, type BlockItem } from '@/lib/block-editor';
import Modal from './Modal';

function Row({ item }: { item: BlockItem }) {
    const locked = item.fields.some(field => field.block_sortable === false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: locked });
    return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 1 : undefined }}
        className="flex min-w-0 items-center gap-2 border border-(--primary)/25 bg-(--background) p-2">
        <button type="button" {...attributes} {...listeners} disabled={locked} aria-label={`ลาก ${item.blockName} #${item.index + 1}`}
            className="h-11 w-5 shrink-0 touch-none cursor-grab text-xl text-(--primary) active:cursor-grabbing disabled:opacity-40">{locked ? '🔒' : '⋮'}</button>
        <div className="min-w-0"><div className="text-[10px] uppercase leading-tight text-(--primary) opacity-60">{item.blockName} #{item.index + 1}</div>
            <p className="truncate text-sm font-bold leading-snug">{blockSummary(item) || 'ไม่มีข้อความ'}</p></div>
    </li>;
}

export default function BlockOrderModal({ title, items, onClose, onApply }: {
    title: string; items: BlockItem[]; onClose: () => void; onApply: (ids: string[]) => void;
}) {
    const [order, setOrder] = useState(items);
    const content = useRef<HTMLDivElement>(null);
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        content.current?.focus();
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
    }, []);
    return <Modal isOpen onClose={onClose} title={`Reorder: ${title}`}>
        <div ref={content} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Reorder: ${title}`}
            className="min-w-0 text-(--foreground) outline-none"
            onKeyDown={event => {
                if (event.key === 'Escape' && !event.defaultPrevented) onClose();
                if (event.ctrlKey || event.metaKey) event.stopPropagation();
            }}>
            <p className="mb-3 shrink-0 text-xs leading-relaxed opacity-60">ลาก BLOCK เพื่อจัดลำดับการแสดงผลในหน้า Editor</p>
            <div className="min-h-0 max-h-[min(55dvh,calc(100dvh-14rem))] overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <DndContext sensors={sensors} modifiers={[({ transform }) => ({ ...transform, x: 0 })]} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
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
                        <ul className="flex min-w-0 flex-col gap-2">{order.map(item => <Row key={item.id} item={item} />)}</ul>
                    </SortableContext>
                </DndContext>
            </div>
            <div className="mt-6 flex shrink-0 gap-3"><button type="button" onClick={onClose} className="flex-1 cursor-pointer border border-(--foreground)/15 py-2 text-[10px] font-black uppercase hover:bg-(--foreground)/5 transition-all">DISCARD</button>
                <button type="button" onClick={() => onApply(order.map(item => item.id))} className="flex-1 cursor-pointer bg-(--primary) py-2 text-[10px] font-black uppercase text-(--background) hover:brightness-110 transition-all">APPLY_PROTOCOL</button></div>
        </div>
    </Modal>;
}
