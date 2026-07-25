"use client";

import Link from 'next/link';

const examples = [
    {
        label: 'Variable',
        code: '{{character_name}}',
        description: 'สร้างช่องกรอกข้อมูลจากชื่อตัวแปร ถ้าข้อมูลเดียวกันใช้หลายจุด ให้ใช้ชื่อตัวแปรเดียวกันได้',
    },
    {
        label: 'Default Value',
        code: '{{character_name:Unknown}}',
        description: 'ใส่ค่าเริ่มต้นหลังเครื่องหมาย : เพื่อให้ field มีค่าตั้งต้น',
    },
    {
        label: 'Field Group',
        code: '{{age:18[GROUP:ข้อมูลพื้นฐาน]}}',
        description: 'จัดตัวแปรให้อยู่ในกลุ่มเดียวกันบนหน้า editor',
    },
    {
        label: 'Repeatable Block',
        code: '[BLOCK:relationships]\n  <div>{{name}}</div>\n  <div>{{description}}</div>\n[/BLOCK:relationships]',
        description: 'ใช้กับส่วนที่ผู้ใช้ต้องเพิ่มซ้ำได้ เช่น ความสัมพันธ์ แกลเลอรี หรือรายการไอเทม',
    },
    {
        label: 'Repeat Marker',
        code: '[REPEAT:stars]\n  *\n[/REPEAT]',
        description: 'ทำซ้ำโค้ดด้านในตามจำนวนที่ผู้ใช้เลือก เหมาะกับดาว คะแนน หรือ element ที่ซ้ำเป็นจำนวน',
    },
];

export default function BlueprintGuide() {
    return (
        <div className="space-y-4 text-(--foreground)">
            <p className="font-Google-Sans text-xs leading-relaxed text-(--foreground)/70">
                Marker สำหรับบอกระบบว่า HTML_BLUEPRINT ส่วนไหนควรกลายเป็น field ในหน้า editor
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
