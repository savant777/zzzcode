"use client";

import Link from 'next/link';

const examples = [
    {
        label: 'Variable',
        code: '{{character_name}}',
        description: 'สร้างตัวแปรไว้ใส่ข้อมูล ถ้าข้อมูลเดียวกันใส่หลายที่สามารถใช้ชื่อเดียวกันได้ แต่ถ้าข้อมูลคนละอย่างต้องชื่อไม่เหมือนกัน',
    },
    {
        label: 'Field Group',
        code: '{{age[GROUP:Basic Info]}}',
        description: 'เอาไว้จัดกลุ่มตัวแปรไว้ด้วยกันในหน้า editor',
    },
    {
        label: 'Repeatable Block',
        code: '[BLOCK:relationships]\n  <div>{{name}}</div>\n[/BLOCK:relationships]',
        description: 'เอาไว้ duplicate โคดทั้งก้อน (Group Name ซ้ำกับนอก BLOCK ได้ แต่ Variable Name ซ้ำไม่ได้',
    },
    {
        label: 'Repeat Marker',
        code: '[REPEAT:stars]\n  *\n[/REPEAT]',
        description: 'เอาไว้ duplicate โคดที่ด้านในไม่ต้องใส่ค่าอะไร เช่น เพิ่มดาว 1 - 5 ดวง',
    },
];

export default function BlueprintGuide() {
    return (
        <div className="space-y-4 text-(--foreground)">
            <p className="font-Google-Sans text-xs leading-relaxed text-(--foreground)/70">
                รูปแบบ marker สำหรับเอาข้อมูลไปใส่ในโคด
            </p>

            <div className="space-y-3">
                {examples.map(example => (
                    <div key={example.label} className="border border-(--primary)/20 bg-black/20 p-3">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-(--primary)">
                            {example.label}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap font-Google-Code text-[10px] leading-relaxed text-(--foreground)/80">
                            {example.code}
                        </pre>
                        <p className="mt-2 font-Google-Sans text-[10px] leading-relaxed text-(--foreground)/45">
                            {example.description}
                        </p>
                    </div>
                ))}
            </div>

            <Link
                href="/creator/guide"
                className="block border border-(--primary)/30 py-2 text-center text-xs font-bold uppercase text-(--primary) transition-colors hover:bg-(--primary) hover:text-black"
            >
                Open_Full_Guide
            </Link>
        </div>
    );
}
