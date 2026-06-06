"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import { requireCreator } from '@/lib/creator';

type GuideSection = {
    id: string;
    title: string;
    eyebrow: string;
    body: string[];
    examples?: {
        label: string;
        code: string;
    }[];
};

const guideSections: GuideSection[] = [
    {
        id: 'overview',
        title: 'Overview',
        eyebrow: 'Creator Guide',
        body: [
            'หน้านี้เป็นคู่มือสำหรับ creator ที่ต้องการสร้างและตั้งค่าเทมเพลตใน ZZZCODE EDITOR',
            'เนื้อหาส่วนนี้สามารถปรับเป็นบทนำ อธิบายภาพรวม workflow และข้อควรรู้ก่อนเริ่มสร้างเทมเพลต',
        ],
    },
    {
        id: 'how-to-add-template',
        title: 'How to Add Template',
        eyebrow: 'Template Setup',
        body: [
            'หัวข้อนี้ควรอธิบายขั้นตอนการเพิ่มเทมเพลตใหม่ ตั้งแต่การใส่ชื่อ คำอธิบาย รูป preview การเลือก tag และการวาง HTML blueprint',
            'อาจเพิ่ม checklist สั้น ๆ ว่าก่อนกด save ควรตรวจอะไรบ้าง เช่น preview image ใช้งานได้, tag ถูกต้อง, และ blueprint ไม่มี marker ผิดรูปแบบ',
        ],
    },
    {
        id: 'blueprint-syntax',
        title: 'Blueprint Syntax',
        eyebrow: 'HTML Blueprint',
        body: [
            'หัวข้อนี้ใช้รวม syntax สำคัญที่ creator ต้องใช้ใน HTML blueprint เพื่อสร้าง field ให้ผู้ใช้งานกรอกข้อมูล',
            'สามารถเขียนคำอธิบายเป็นภาษาไทยละเอียดขึ้นได้ เช่น variable คืออะไร default value ใช้เมื่อไหร่ และ group/block เหมาะกับเทมเพลตแบบไหน',
        ],
        examples: [
            {
                label: 'Variable',
                code: '<div>{{character_name}}</div>',
            },
            {
                label: 'Variable with Default Value',
                code: '<div>{{character_name:Unknown}}</div>',
            },
            {
                label: 'Field Group',
                code: '{{age:18[GROUP:Basic Info]}}',
            },
            {
                label: 'Repeatable Block',
                code: '[BLOCK:relationships]\n  <div>{{name}}</div>\n  <div>{{description}}</div>\n[/BLOCK:relationships]',
            },
        ],
    },
    {
        id: 'config-field',
        title: 'Config Field',
        eyebrow: 'Field Types',
        body: [
            'หัวข้อนี้ควรอธิบายการตั้งค่า field หลังระบบ detect variable จาก blueprint แล้ว',
            'ตัวอย่างเนื้อหา: text เหมาะกับข้อความสั้น, bbcode เหมาะกับพื้นที่เขียนยาว, color เหมาะกับค่าสี, select ใช้กับตัวเลือกสำเร็จรูป, slider ใช้กับตัวเลข, gradient ใช้กับพื้นหลังหลายสี',
        ],
    },
    {
        id: 'tags-and-categories',
        title: 'Tags and Categories',
        eyebrow: 'Discovery',
        body: [
            'หัวข้อนี้ใช้บอกวิธีเลือก tag ให้ template เพื่อให้ผู้ใช้งานหาเจอง่ายใน dashboard',
            'อาจอธิบายว่า tag creator ถูกผูกให้อัตโนมัติ และ creator ไม่ควรแก้ tag ใน group creators ด้วยตัวเอง',
        ],
    },
    {
        id: 'private-template',
        title: 'Private Template',
        eyebrow: 'Access',
        body: [
            'หัวข้อนี้ใช้บอกวิธีตั้ง private template และ password สำหรับเทมเพลตที่ไม่อยากเปิดให้ทุกคนใช้ทันที',
            'ควรอธิบายว่าผู้ใช้งานต้องกรอกรหัสก่อนเข้า editor แต่เมื่อเข้าแล้วจะยังต้อง copy code ไปวางใน RoleplayTH เอง',
        ],
    },
    {
        id: 'best-practices',
        title: 'Best Practices',
        eyebrow: 'Quality Checklist',
        body: [
            'หัวข้อนี้ใช้รวมข้อแนะนำ เช่น ตั้งชื่อ field ให้อ่านง่าย, แยก group ตามลำดับการกรอก, ใช้ default value เท่าที่จำเป็น และทดสอบบนจอเล็กก่อนเผยแพร่',
            'ส่วนนี้เหมาะกับการใส่ checklist สำหรับ creator ก่อนส่งเทมเพลตขึ้นใช้งานจริง',
        ],
    },
];

export default function CreatorGuidePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(guideSections[0].id);

    const currentSection = useMemo(() => {
        return guideSections.find(section => section.id === activeSection) || guideSections[0];
    }, [activeSection]);

    useEffect(() => {
        const initGuide = async () => {
            const session = await requireCreator();

            if (!session.user) {
                toast.error("ERROR_ACCESS_DENIED: LOGIN_REQUIRED");
                router.replace('/?group=category&tag=all');
                return;
            }

            if (!session.canAccessCreatorTools) {
                toast.error("ERROR_ACCESS_DENIED: CREATOR_REQUIRED");
                router.replace('/?group=category&tag=all');
                return;
            }

            setLoading(false);
        };

        initGuide();
    }, [router]);

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs editorMode="GUIDE" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Loading_Creator_Guide...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs editorMode="GUIDE" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <main className="lg:grid flex flex-col min-h-0 flex-1 gap-4 overflow-hidden px-4 mb-4 lg:grid-cols-[240px_1fr]">
                <aside className="min-h-0 border border-(--primary) bg-(--background) p-3 lg:overflow-y-auto scrollbar-hide">
                    <div className="mb-3 border-b border-(--primary)/30 pb-2 text-[10px] uppercase tracking-[0.2em] text-(--foreground)/40">
                        Guide_Index
                    </div>
                    <nav className="flex flex-wrap gap-2 overflow-x-auto lg:flex-col lg:overflow-x-visible scrollbar-hide">
                        {guideSections.map(section => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => setActiveSection(section.id)}
                                className={`flex-1 lg:flex-none whitespace-nowrap shrink-0 border px-3 py-2 text-left text-[10px] uppercase transition-colors cursor-pointer lg:w-full ${
                                    activeSection === section.id
                                        ? 'border-(--primary) bg-(--primary) text-black font-bold'
                                        : 'border-(--primary)/20 text-(--foreground)/60 hover:border-(--primary) hover:text-(--primary)'
                                }`}
                            >
                                {section.title}
                            </button>
                        ))}
                    </nav>
                </aside>

                <section className="max-lg:flex-1 min-h-0 overflow-y-auto border border-(--primary) bg-(--background) p-4 text-(--foreground) scrollbar-hide">
                    <div className="border-b border-(--primary)/75 pb-4">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-(--foreground)/40">
                            {currentSection.eyebrow}
                        </div>
                        <h1 className="text-3xl md:text-5xl text-(--primary) uppercase leading-none">
                            {currentSection.title}
                        </h1>
                    </div>

                    <div className="space-y-4 py-4 font-Google-Sans text-sm leading-relaxed text-(--foreground)/75">
                        {currentSection.body.map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                        ))}
                    </div>

                    {currentSection.examples && (
                        <div className="space-y-3">
                            {currentSection.examples.map(example => (
                                <div key={example.label} className="border border-(--primary)/20 bg-black/20 p-3">
                                    <div className="mb-2 font-Google-Code text-[10px] uppercase tracking-widest text-(--primary)">
                                        {example.label}
                                    </div>
                                    <pre className="overflow-x-auto whitespace-pre-wrap font-Google-Code text-[10px] leading-relaxed text-(--foreground)/80">
                                        {example.code}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 flex flex-wrap gap-2 border-t border-(--primary)/20 pt-4">
                        <Link
                            href="/create"
                            className="border border-(--primary)/30 px-3 py-2 text-xs font-bold uppercase text-(--primary) transition-colors hover:bg-(--primary) hover:text-black"
                        >
                            Add_Template
                        </Link>
                        <Link
                            href="/creator/tags"
                            className="border border-(--primary)/30 px-3 py-2 text-xs font-bold uppercase text-(--primary) transition-colors hover:bg-(--primary) hover:text-black"
                        >
                            Manage_Tags
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
