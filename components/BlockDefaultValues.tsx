"use client";

import { useState } from 'react';
import type { FieldConfig } from '@/lib/template-parser';
import { defaultBlockCount } from '@/lib/block-defaults';
import { getDefaultValue } from '@/lib/field-defaults';
import FieldRenderer from './FieldRenderer';

export default function BlockDefaultValues({ fields, onChange }: {
    fields: FieldConfig[];
    onChange: (fieldId: string, index: number, value: any, inherit?: boolean) => void;
}) {
    const [selected, setSelected] = useState(0);
    const count = defaultBlockCount(fields);
    const index = Math.min(selected, Math.max(0, count - 1));
    return <details className="mb-3 border border-(--primary)/20 p-2">
        <summary className="cursor-pointer text-xs text-(--primary)">Block Default Values</summary>
        <p className="my-2 text-xs text-(--foreground)/50">ตั้งค่า Default Value เฉพาะฟิลด์ที่ต้องการให้ต่างจาก Default Value กลาง มีผลกับดราฟต์ใหม่เท่านั้น</p>
        {count === 0 ? <p className="text-xs text-(--foreground)/40">ตั้ง Initial อย่างน้อย 1 เพื่อกำหนดค่าเริ่มต้นแยกบล็อก</p> : <>
            <label className="flex items-center gap-2 text-xs text-(--primary)">
                Block
                <input type="number" min={1} max={count} step={1} value={index + 1}
                    onChange={event => {
                        const value = Number(event.target.value);
                        if (Number.isSafeInteger(value)) setSelected(Math.max(0, Math.min(count - 1, value - 1)));
                    }} className="w-16 shrink-0 bg-black border border-(--primary)/30 p-1" />
                <span>/ {count}</span>
            </label>
            <div className="mt-3 flex flex-col gap-3">
                {fields.map(field => {
                    const custom = Object.prototype.hasOwnProperty.call(field.block_default_values || {}, index);
                    return <div key={`${field.id}-${index}`} className="min-w-0 space-y-2 border border-(--primary)/25 bg-(--background) p-2">
                        <p className="font-Google-Sans break-words text-sm font-bold">{field.label || field.variable_name}</p>
                        <label className="flex items-center gap-2 text-xs text-(--foreground)/70 cursor-pointer">
                            <input type="checkbox" checked={custom} className="peer sr-only" onChange={event => onChange(field.id, index, structuredClone(getDefaultValue(field)), !event.target.checked)} />
                            <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center border border-(--primary)/30 bg-black/30 peer-checked:[&>span]:bg-(--primary) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--primary)">
                                <span className="h-2 w-2" />
                            </span>
                            custom default value
                        </label>
                        {custom && <div className="min-w-0">
                            <FieldRenderer field={field.type === 'bbcode' ? { ...field, config: { ...field.config, bbcode_height: 'compact' } } : field}
                                hideLabel value={field.block_default_values![index]}
                                onChange={(_name, value) => onChange(field.id, index, value)} />
                        </div>}
                    </div>;
                })}
            </div>
        </>}
    </details>;
}
