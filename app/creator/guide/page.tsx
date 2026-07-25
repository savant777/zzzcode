"use client";

import { type MouseEvent, type WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import { requireCreator } from '@/lib/creator';

type GuideTableRow = {
    label: string;
    description: string;
    notes?: string[];
};

type GuideExample = {
    label: string;
    code: string;
    description?: string;
};

type GuideImage = {
    src: string;
    alt: string;
    width: number;
    height: number;
    wide?: boolean;
};

type GuideSection = {
    id: string;
    title: string;
    eyebrow: string;
    body?: string[];
    images?: GuideImage[];
    table?: GuideTableRow[];
    steps?: string[];
    examples?: GuideExample[];
};

const guideSections: GuideSection[] = [
    {
        id: 'overview',
        title: 'Creator Tools',
        eyebrow: 'เริ่มต้นใช้งาน',
        body: [
            'เมื่อเข้าสู่ระบบด้วยบัญชี creator แล้ว แถบเครื่องมือหลักจะมีเมนูสำหรับ สร้างเทมเพลต จัดการแท็ก เปิดคู่มือ และดูโปรไฟล์',
        ],
        images: [
            { src: '/creator-guide/image13.png', alt: 'เมนูต่าง ๆ บนแถบเครื่องมือ', width: 1918, height: 79, wide: true }
        ],
        table: [
            {
                label: '[+] ADD TEMPLATE',
                description: 'ใช้เพิ่มเทมเพลตโคดใหม่ เพื่อให้ผู้ใช้งานทั่วไปเลือกใช้และกรอกข้อมูลผ่าน editor ได้',
            },
            {
                label: '[#] MANAGE TAGS',
                description: 'ใช้เพิ่ม แก้ไข หรือปิดการใช้งาน hashtag สำหรับจัดหมวดหมู่โคด'
            },
            {
                label: '[?] GUIDE',
                description: 'อ่านคู่มือเกี่ยวกับ ZZZCODE EDITOR สำหรับ CREATOR'
            },
            {
                label: '[*] PROFILE',
                description: 'แก้ไข ชื่อ และ TAG ที่แสดงบนเทมเพลตของตัวเอง',
                notes: ['มีผลกับทุกเทมเพลตที่ตัวเองสร้าง'],
            },
        ],
    },
    {
        id: 'template-flow',
        title: 'Add Template Flow',
        eyebrow: 'ขั้นตอนการลงเทมเพลต',
        body: [
            'หลังจากกด [+] ADD TEMPLATE ระบบจะเปิดหน้าสร้างเทมเพลต ซึ่งแบ่งเป็นสองส่วนหลักคือ TEMPLATE_INFO สำหรับข้อมูลเทมเพลต และ TEMPLATE_FIELDS สำหรับแสดงตัวแปรที่ตรวจพบจาก HTML_BLUEPRINT',
        ],
        images: [
            { src: '/creator-guide/image14.png', alt: 'ภาพรวมหน้าสร้างเทมเพลต', width: 1903, height: 820, wide: true },
        ],
        steps: [
            'ใส่ข้อมูลพื้นฐานของเทมเพลตใน TEMPLATE_INFO',
            'วางโคดต้นฉบับใน HTML_BLUEPRINT และครอบส่วนที่ต้องการให้แก้ไขด้วย marker',
            'ตรวจสอบตัวแปรที่ระบบ detect ใน TEMPLATE_FIELDS',
            'กด Save เพื่อบันทึกเทมเพลต จากนั้นแก้ไข field config ให้เหมาะกับการใช้งานจริง',
            'ทุกครั้งที่แก้ไข field config เสร็จ ให้กด APPLY_PROTOCOL เพื่อบันทึกค่าของ field นั้น',
        ],
    },
    {
        id: 'template-info',
        title: 'Template Info',
        eyebrow: 'ข้อมูลเทมเพลต',
        body: [
            'TEMPLATE_INFO คือพื้นที่สำหรับใส่ข้อมูลที่ใช้แสดงเทมเพลตบนหน้า Dashboard และข้อมูลที่ระบบต้องใช้ตอนสร้าง Editor',
        ],
        images: [
            { src: '/creator-guide/image15.png', alt: 'ส่วน Template Info', width: 950, height: 820, wide: true },
        ],
        table: [
            { label: 'TEMPLATE_TITLE', description: 'ชื่อของเทมเพลต' },
            { label: 'DESCRIPTION', description: 'คำอธิบายสั้น ๆ ของเทมเพลต' },
            { label: 'ASSIGN_TAGS', description: 'แท็กหรือหมวดหมู่ของเทมเพลต เพื่อให้ผู้ใช้ค้นหาเจอง่ายขึ้น', notes: ['สามารถกด EXPAND_TAGS เพื่อดูแท็กทั้งหมด','แท็กเริ่มต้นจะเป็น GLOBAL TAGS','สามารถสร้างแท็กเพิ่มได้ที่ [#] MANAGE TAGS'] },
            {
                label: 'PERSONAL_INFO',
                description: 'ตั้งค่าเทมเพลตเป็นสาธารณะหรือส่วนตัว',
                notes: [
                    'ถ้าไม่กดปุ่มสี่เหลี่ยม เทมเพลตจะเป็นสาธารณะ ทุกคนสามารถเข้าใช้ได้',
                    'ถ้ากดปุ่มสี่เหลี่ยม เทมเพลตจะเป็นส่วนตัว และสามารถใส่รหัสผ่านได้',
                ],
            },
            { label: 'TEMPLATE_DRAFTS', description: 'เปิดระบบหลาย draft ในหน้า editor สาธารณะ เมื่อเทมเพลตต้องการให้ผู้ใช้เก็บหลายเวอร์ชัน' },
            { label: 'PREVIEW_IMAGE', description: 'ลิงก์ภาพ preview ของเทมเพลต ควรใช้รูปอัตราส่วน 1:1', notes:['ขนาดที่ใช้โดยปกติคือ 600x600 px เว้นขอบบน-ล่าง 43px เว้นขอบซ้าย-ขวา 50px พื้นหลังสี #131313'] },
            { label: 'HTML_BLUEPRINT', description: 'ช่องสำหรับวางโคด HTML หรือ BBCode template พร้อม marker' },
        ],
    },
    {
        id: 'blueprint-syntax',
        title: 'Blueprint Syntax',
        eyebrow: 'Marker สำคัญ',
        body: [
            'HTML_BLUEPRINT คือโคดต้นฉบับของเทมเพลต ให้ใส่ marker ในตำแหน่งที่ต้องการให้ผู้ใช้แก้ไขได้ ระบบจะอ่าน marker เหล่านี้แล้วสร้าง field ในหน้า Editor อัตโนมัติ',
        ],
        examples: [
            {
                label: 'Variable',
                code: '<div>{{image_url}}</div>',
                description: 'สร้าง field ชื่อ image_url สำหรับให้ผู้ใช้กรอกค่า',
            },
            {
                label: 'Field Group',
                code: '{{character_name[GROUP:ข้อมูลพื้นฐาน]}}\n{{age[GROUP:ข้อมูลพื้นฐาน]}}',
                description: 'จัดกลุ่ม field ในหน้า Editor',
            },
            {
                label: 'Repeatable Block',
                code: '[BLOCK:relationships]\n  <div>{{name}}</div>\n  <div>{{description}}</div>\n[/BLOCK:relationships]',
                description: 'ใช้กับส่วนที่ผู้ใช้สามารถเพิ่มซ้ำได้ เช่น กล่องความสัมพันธ์ แกลเลอรี หรือรายการไอเทม',
            },
            {
                label: 'Repeat Marker',
                code: '[REPEAT:stars]\n  *\n[/REPEAT]',
                description: 'ทำซ้ำโคดด้านในตามจำนวนที่ผู้ใช้เลือก เหมาะกับดาว คะแนน หรือ element ที่ซ้ำเป็นจำนวน',
            },
        ],
        images: [
            { src: '/creator-guide/image10.png', alt: 'ตัวอย่างการครอบตัวแปรด้วย {{ชื่อตัวแปร}} : Editor จะสร้าง field ตามตัวแปร ไม่ควรตั้งชื่อซ้ำกันหากไม่ได้รับค่าเดียวกัน', width: 881, height: 246, wide: true },
            { src: '/creator-guide/image7.png', alt: 'ตัวอย่างการใส่ [GROUP:ชื่อกลุ่ม] ให้ตัวแปร : Editor จะจัดกลุ่ม field ตาม Group ที่กำหนด', width: 881, height: 244, wide: true },
            { src: '/creator-guide/image3.png', alt: 'ตัวอย่าง [BLOCK:ชื่อบล็อก][/BLOCK:ชื่อบล็อก] ใน HTML blueprint : Editor จะสร้างส่วนที่สามารถเพิ่มซ้ำได้ในเทมเพลต สามารถซ้อนได้สูงสุด 2 ชั้น', width: 872, height: 399, wide: true },
            { src: '/creator-guide/image5.png', alt: 'ตัวอย่าง Config Fields ของ Repeatable Block', width: 926, height: 816, wide: false },
            { src: '/creator-guide/image1.png', alt: 'ผลลัพธ์ของ Repeatable Block ในหน้า Editor', width: 884, height: 469, wide: false },
        ],
    },
    {
        id: 'template-fields',
        title: 'Template Fields',
        eyebrow: 'ตั้งค่าตัวแปร',
        body: [
            'TEMPLATE_FIELDS ใช้แก้ไขรูปแบบของตัวแปรที่ระบบตรวจพบจาก HTML_BLUEPRINT แต่ละ field สามารถเปลี่ยน label, type, ค่าเริ่มต้น, คำอธิบาย และรายละเอียดเฉพาะของ input type ได้',
        ],
        images: [
            { src: '/creator-guide/image16.png', alt: 'ส่วน Template Fields', width: 953, height: 820 },
            { src: '/creator-guide/image17.png', alt: 'หลัง Save เทมเพลตใหม่ จะแสดงปุ่มแก้ไข field', width: 956, height: 822 },
            { src: '/creator-guide/image11.png', alt: 'หน้าตั้งค่า field และปุ่ม Apply Protocol', width: 555, height: 509, wide: true },
        ],
        table: [
            { label: 'Text', description: 'สำหรับข้อความที่ไม่ต้องปรับแต่ง เช่น ลิงก์ภาพหรือข้อความสั้น' },
            { label: 'BB Code', description: 'สำหรับข้อความยาวที่ต้องการปุ่มจัดรูปแบบ เช่น เนื้อหาโรลเพลย์หรือหมายเหตุ', notes: ['สามารถเลือกให้โชว์ตัวนับจำนวนคำได้ (ยังไม่แม่นยำมากนัก)'] },
            { label: 'Color', description: 'สำหรับเลือกสีเฉพาะ เช่น สีพื้นหลังหรือสีฟอนต์' },
            { label: 'Select Menu', description: 'สำหรับตัวแปรที่มีตัวเลือกสำเร็จรูป เช่น ตำแหน่งภาพ ขนาดภาพ หรือธีมโคด',notes: ['แต่ละตัวเลือกสามารถมี type ย่อยได้อีก'] },
            { label: 'Slider', description: 'สำหรับตัวเลขที่ควรปรับด้วยแถบเลื่อน เช่น องศา ระยะ หรือขนาด' },
            { label: 'Check Box', description: 'สำหรับค่าที่เปิดหรือปิดได้' },
            { label: 'Gradient', description: 'สำหรับไล่เฉดสีหลายสี' },
        ],
    },
    {
        id: 'tags-and-publish',
        title: 'Tags And Publish',
        eyebrow: 'ก่อนแจกจ่าย',
        body: [
            'แท็กช่วยให้ผู้ใช้เจอเทมเพลตจาก Dashboard ได้ง่ายขึ้น ควรเลือกหมวดหมู่ให้ตรงกับลักษณะโคด (แท็ก Creator จะถูกเพิ่มให้อัตโนมัติ ไม่จำเป็นต้องสร้างเพิ่ม)',
            'ก่อนส่งเทมเพลตให้คนอื่นใช้ ควรตรวจ preview image, private/password setting, HTML_BLUEPRINT, field order, group order และลองเปิดหน้า Editor เพื่อตรวจผลลัพธ์จริง',
        ],
        table: [
            { label: 'Public Template', description: 'ทุกคนสามารถเปิดใช้ได้ทันที เหมาะกับโคดที่พร้อมแจก' },
            { label: 'Private Template', description: 'ผู้ใช้ต้องกรอกรหัสผ่านก่อนเข้า Editor เหมาะกับโคดส่วนตัวหรือใช้งานเฉพาะกลุ่ม' },
        ],
    },
];

export default function CreatorGuidePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(guideSections[0].id);
    const [selectedImage, setSelectedImage] = useState<GuideImage | null>(null);
    const [imageZoom, setImageZoom] = useState(1);
    const imageScrollRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef({
        isDragging: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        moved: false,
    });

    const currentSection = useMemo(() => {
        return guideSections.find(section => section.id === activeSection) || guideSections[0];
    }, [activeSection]);

    const closeImage = useCallback(() => {
        setSelectedImage(null);
        setImageZoom(1);
    }, []);

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

    useEffect(() => {
        if (!selectedImage) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeImage();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeImage, selectedImage]);

    const updateImageZoom = (nextZoom: number) => {
        setImageZoom(Math.min(4, Math.max(1, Number(nextZoom.toFixed(2)))));
    };

    const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        updateImageZoom(imageZoom + (event.deltaY < 0 ? 0.2 : -0.2));
    };

    const toggleImageZoom = () => {
        if (dragStartRef.current.moved) return;
        updateImageZoom(imageZoom > 1 ? 1 : 2);
    };

    const handleImageMouseDown = (event: MouseEvent<HTMLDivElement>) => {
        if (imageZoom <= 1 || !imageScrollRef.current) return;

        event.preventDefault();
        dragStartRef.current = {
            isDragging: true,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: imageScrollRef.current.scrollLeft,
            scrollTop: imageScrollRef.current.scrollTop,
            moved: false,
        };
    };

    const handleImageMouseMove = (event: MouseEvent<HTMLDivElement>) => {
        if (!dragStartRef.current.isDragging || !imageScrollRef.current) return;

        event.preventDefault();
        const deltaX = event.clientX - dragStartRef.current.startX;
        const deltaY = event.clientY - dragStartRef.current.startY;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            dragStartRef.current.moved = true;
        }

        imageScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - deltaX;
        imageScrollRef.current.scrollTop = dragStartRef.current.scrollTop - deltaY;
    };

    const stopImageDrag = () => {
        dragStartRef.current.isDragging = false;
        window.setTimeout(() => {
            dragStartRef.current.moved = false;
        }, 0);
    };

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
                    <div className="mb-3 border-b border-(--primary)/30 pb-2 text-sm uppercase tracking-[0.2em] text-(--foreground)/40">
                        Guide_Index
                    </div>
                    <nav className="flex flex-wrap gap-2 overflow-x-auto lg:flex-col lg:overflow-x-visible scrollbar-hide">
                        {guideSections.map(section => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => setActiveSection(section.id)}
                                className={`flex-1 lg:flex-none whitespace-nowrap shrink-0 border px-3 py-2 text-left text-sm uppercase transition-colors cursor-pointer lg:w-full ${
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

                <section className="max-lg:flex-1 min-h-0 overflow-y-auto border border-(--primary) bg-(--background) text-(--foreground) scrollbar-hide">
                    <div className="sticky top-0 z-5 border-b border-(--primary)/75 bg-(--background) p-4">
                        <div className="mb-1 font-Google-Sans uppercase tracking-wide text-(--foreground)/40">
                            {currentSection.eyebrow}
                        </div>
                        <h1 className="text-3xl md:text-5xl text-(--primary) uppercase leading-none">
                            {currentSection.title}
                        </h1>
                    </div>

                    <div className="space-y-6 p-4">
                        {currentSection.body && (
                            <div className="space-y-4 font-Google-Sans leading-relaxed text-(--foreground)/75">
                                {currentSection.body.map((paragraph, index) => (
                                    <p key={index}>{paragraph}</p>
                                ))}
                            </div>
                        )}

                        {currentSection.images && (
                            <div className="grid gap-3 md:grid-cols-2">
                                {currentSection.images.map(image => (
                                    <figure
                                        key={image.src}
                                        className={`border border-(--primary)/30 bg-black/20 p-2 ${image.wide ? 'md:col-span-2' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImageZoom(1);
                                                setSelectedImage(image);
                                            }}
                                            className="block w-full cursor-zoom-in"
                                            aria-label={`Open image: ${image.alt}`}
                                        >
                                            <Image
                                                src={image.src}
                                                alt={image.alt}
                                                width={image.width}
                                                height={image.height}
                                                className="max-h-[520px] w-full object-contain transition-opacity hover:opacity-80"
                                            />
                                        </button>
                                        <figcaption className="mt-2 font-Google-Sans leading-relaxed text-(--foreground)/45">
                                            {image.alt}
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                        )}

                        {currentSection.steps && (
                            <ol className="space-y-2 font-Google-Sans leading-relaxed text-(--foreground)/75">
                                {currentSection.steps.map((step, index) => (
                                    <li key={step} className="grid grid-cols-[28px_1fr] gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center border border-(--primary)/40 font-Google-Code text-[10px] text-(--primary)">
                                            {index + 1}
                                        </span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        )}

                        {currentSection.table && (
                            <div className="overflow-hidden border border-(--primary)/30">
                                {currentSection.table.map(row => (
                                    <div key={row.label} className="grid gap-2 border-b border-(--primary)/20 p-3 last:border-b-0 md:grid-cols-[180px_1fr]">
                                        <div className="font-Google-Code uppercase text-(--primary)">
                                            {row.label}
                                        </div>
                                        <div className="font-Google-Sans leading-relaxed text-(--foreground)/75">
                                            <p>{row.description}</p>
                                            {row.notes && (
                                                <ul className="mt-2 space-y-1 text-sm text-(--foreground)/55">
                                                    {row.notes.map(note => (
                                                        <li key={note}>* {note}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {currentSection.examples && (
                            <div className="space-y-3">
                                {currentSection.examples.map(example => (
                                    <div key={example.label} className="border border-(--primary)/20 bg-black/20 p-3">
                                        <div className="mb-2 font-Google-Code uppercase tracking-widest text-(--primary)">
                                            {example.label}
                                        </div>
                                        <pre className="overflow-x-auto whitespace-pre-wrap font-Google-Code leading-relaxed text-(--foreground)/80">
                                            {example.code}
                                        </pre>
                                        {example.description && (
                                            <p className="mt-2 font-Google-Sans text-sm leading-relaxed text-(--foreground)/50">
                                                {example.description}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={selectedImage.alt}
                    onClick={closeImage}
                >
                    <button
                        type="button"
                        className="absolute right-4 top-4 border border-(--primary)/50 bg-(--background) px-3 py-2 font-Google-Code text-xs uppercase text-(--primary) transition-colors hover:bg-(--primary) hover:text-black cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            closeImage();
                        }}
                    >
                        Close
                    </button>

                    <div className="absolute left-4 top-4 flex items-center gap-1 border border-(--primary)/40 bg-(--background) p-1 font-Google-Code text-xs text-(--primary)">
                        <button
                            type="button"
                            className="h-8 w-8 cursor-pointer border border-(--primary)/30 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(imageZoom - 0.25);
                            }}
                            aria-label="Zoom out"
                        >
                            -
                        </button>
                        <button
                            type="button"
                            className="h-8 min-w-14 cursor-pointer border border-(--primary)/30 px-2 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(1);
                            }}
                            aria-label="Reset zoom"
                        >
                            {Math.round(imageZoom * 100)}%
                        </button>
                        <button
                            type="button"
                            className="h-8 w-8 cursor-pointer border border-(--primary)/30 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(imageZoom + 0.25);
                            }}
                            aria-label="Zoom in"
                        >
                            +
                        </button>
                    </div>

                    <figure
                        className="flex max-h-full max-w-[min(1200px,100%)] flex-col gap-2 pt-12"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            ref={imageScrollRef}
                            className={`min-h-0 overflow-auto border border-(--primary)/40 bg-(--background) p-2 ${imageZoom > 1 ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
                            onWheel={handleImageWheel}
                            onMouseDown={handleImageMouseDown}
                            onMouseMove={handleImageMouseMove}
                            onMouseUp={stopImageDrag}
                            onMouseLeave={stopImageDrag}
                            style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
                        >
                            <Image
                                src={selectedImage.src}
                                alt={selectedImage.alt}
                                width={selectedImage.width}
                                height={selectedImage.height}
                                draggable={false}
                                className={`h-auto object-contain ${imageZoom === 1 ? 'max-h-[82vh] max-w-full cursor-zoom-in' : 'max-w-none cursor-grab active:cursor-grabbing'}`}
                                style={{ width: `${selectedImage.width * imageZoom}px` }}
                                onDragStart={(event) => event.preventDefault()}
                                onClick={toggleImageZoom}
                            />
                        </div>
                        <figcaption className="font-Google-Sans text-sm leading-relaxed text-(--foreground)/60">
                            {selectedImage.alt}
                            <span className="ml-2 font-Google-Code text-[10px] uppercase text-(--foreground)/35">
                                Click or scroll to zoom. Drag when zoomed.
                            </span>
                        </figcaption>
                    </figure>
                </div>
            )}
        </div>
    );
}
