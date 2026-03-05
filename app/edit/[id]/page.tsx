"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function EditTemplate() {
    const router = useRouter();
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");
    const [htmlBlueprint, setHtmlBlueprint] = useState("");
    const [isPersonal, setIsPersonal] = useState(false);
    const [password, setPassword] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [fields, setFields] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/'); return; }
            setUser(user);

            const { data: template } = await supabase.from('templates').select('*').eq('id', id).single();
            if (template) {
                setTitle(template.title);
                setCategory(template.category);
                setHtmlBlueprint(template.html_blueprint);
                setIsPersonal(template.is_personal);
                setPassword(template.password || "");
                setIsActive(template.is_active);
            }

            const { data: fData } = await supabase.from('template_fields').select('*').eq('template_id', id).order('order_index');
            if (fData) setFields(fData);

            setLoading(false);
        };
        fetchData();
    }, [id, router]);

    const handleUpdate = async () => {
        setLoading(true);
        try {
            const { error: tError } = await supabase.from('templates').update({
                title, 
                category, 
                html_blueprint: htmlBlueprint,
                is_personal: isPersonal, 
                password, 
                is_active: isActive
            }).eq('id', id);

            if (tError) throw tError;
            
            const fieldsToUpsert = fields.map((f) => ({
                ...(f.id ? { id: f.id } : {}),
                template_id: id,
                label: f.label,
                field_key: f.field_key,
                type: f.type,
                order_index: f.order_index
            }));

            const { error: fError } = await supabase.from('template_fields').upsert(fieldsToUpsert, {
                onConflict: 'id'
            });

            if (fError) throw fError;

            alert("อัปเดตข้อมูลสำเร็จ! ✨");
            router.push('/');
        } catch (err: any) {
            alert("เกิดข้อผิดพลาด: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (confirm("แน่ใจนะว่าจะลบทิ้งถาวร?")) {
            await supabase.from('templates').delete().eq('id', id);
            router.push('/');
        }
    };

    if (loading && !user) return <div className="p-10 text-center">กำลังโหลด...</div>;

    return (
        <div className="max-w-5xl mx-auto p-10">
            <div className="flex justify-between items-center mb-8">
                <Link href="/" className="text-gray-500 hover:text-black transition">← ย้อนกลับไป Dashboard</Link>
                <h1 className="text-2xl font-bold">แก้ไขเทมเพลต ✍️</h1>
                <button onClick={handleDelete} className="text-red-500 hover:underline text-sm font-bold">ลบเทมเพลตนี้ทิ้ง</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Form ฝั่งซ้าย (เหมือนหน้า Create) */}
                <div className="space-y-4 bg-white p-6 rounded-2xl border shadow-sm">
                    <div>
                        <label className="block text-sm font-bold mb-1">สถานะการแสดงผล</label>
                        <select className="w-full border p-2 rounded-lg" value={isActive ? "1" : "0"} onChange={e => setIsActive(e.target.value === "1")}>
                        <option value="1">แสดงปกติ (Active)</option>
                        <option value="0">ซ่อนไว้ (Inactive)</option>
                        </select>
                    </div>
                    {/* ... ส่วน input อื่นๆ title, category, blueprint ... */}
                    <input className="w-full border p-2 rounded-lg" value={title} onChange={e => setTitle(e.target.value)} placeholder="ชื่อเทมเพลต" />
                    <textarea className="w-full border p-2 rounded-lg h-60 font-mono text-xs" value={htmlBlueprint} onChange={e => setHtmlBlueprint(e.target.value)} />
                </div>

                {/* ส่วนจัดการ Fields ฝั่งขวา */}
                <div className="bg-gray-50 p-6 rounded-2xl border">
                    {/* ก๊อปปี้ Logic การวนลูปแสดง fields และปุ่มเพิ่ม fields จากหน้า Create มาใส่ตรงนี้ได้เลยครับ */}
                </div>
            </div>

            <div className="mt-8 flex justify-center gap-4">
                <button onClick={handleUpdate} className="bg-black text-white px-10 py-3 rounded-xl font-bold">บันทึกการแก้ไข</button>
            </div>
        </div>
    );
}