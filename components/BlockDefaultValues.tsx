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
        <summary className="cursor-pointer text-xs text-(--primary)">Initial_Block_Values</summary>
        <p className="my-2 text-xs text-(--foreground)/50">เลือก Custom เฉพาะฟิลด์ที่ต้องการให้ต่างจากค่ากลาง ใช้กับดราฟต์ใหม่เท่านั้น</p>
        {count === 0 ? <p className="text-xs text-(--foreground)/40">ตั้ง Initial_Blocks อย่างน้อย 1 เพื่อกำหนดค่าเริ่มต้นแยกบล็อก</p> : <>
            <label className="flex items-center gap-2 text-xs text-(--primary)">
                Block
                <select value={index} onChange={event => setSelected(Number(event.target.value))} className="bg-black border border-(--primary)/30 p-1">
                    {Array.from({ length: count }, (_, i) => <option key={i} value={i}>#{i + 1}</option>)}
                </select>
            </label>
            <div className="mt-3 flex flex-col gap-3">
                {fields.map(field => {
                    const custom = Object.prototype.hasOwnProperty.call(field.block_default_values || {}, index);
                    return <div key={`${field.id}-${index}`} className="border-t border-(--primary)/15 pt-2">
                        <label className="mb-2 flex items-center gap-2 text-xs text-(--foreground)/70 cursor-pointer">
                            <input type="checkbox" checked={custom} onChange={event => onChange(field.id, index, structuredClone(getDefaultValue(field)), !event.target.checked)} />
                            Custom: {field.label || field.variable_name}
                        </label>
                        {custom ? <FieldRenderer field={field} value={field.block_default_values![index]}
                            onChange={(_name, value) => onChange(field.id, index, value)} />
                            : <span className="text-xs text-(--foreground)/35">Use shared default</span>}
                    </div>;
                })}
            </div>
        </>}
    </details>;
}
