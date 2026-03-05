"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateTemplate() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [user, setUser] = useState<any>(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("Profile");
    const [htmlBlueprint, setHtmlBlueprint] = useState("");
    const [isPersonal, setIsPersonal] = useState(false);
    const [password, setPassword] = useState("");
    
    const [fields, setFields] = useState([
        { label: "ชื่อ", field_key: "name", type: "text", order_index: 1 }
    ]);

    const addField = () => {
        setFields([...fields, { label: "", field_key: "", type: "text", order_index: fields.length + 1 }]);
    };

    const updateField = (index: number, key: string, value: any) => {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], [key]: value };
        setFields(newFields);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const { data: templateData, error: tError } = await supabase
                .from('templates')
                .insert([{ 
                title, category, html_blueprint: htmlBlueprint, 
                is_personal: isPersonal, password: isPersonal ? password : null 
                }])
                .select()
                .single();

            if (tError) throw tError;

            const fieldsToSave = fields.map(f => ({
                ...f,
                template_id: templateData.id
            }));

            const { error: fError } = await supabase.from('template_fields').insert(fieldsToSave);
            if (fError) throw fError;

            alert("สร้างเทมเพลตสำเร็จแล้ว!");
            router.push('/');
        } catch (err: any) {
            alert("เกิดข้อผิดพลาด: " + err.message);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setCheckingAuth(false);
        };
        checkUser();
    }, []);

    if (checkingAuth) {
        return <div className="h-screen flex items-center justify-center font-bold">กำลังตรวจสอบสิทธิ์...</div>;
    }

    if (!user) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-10 rounded-3xl shadow-xl border border-red-100 text-center max-w-sm">
                    <div className="text-6xl mb-6">🚫</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">สิทธิ์ไม่ถึงนะจ๊ะ!</h2>
                    <p className="text-gray-500 mb-8">พื้นที่นี้สงวนไว้สำหรับ Admin เท่านั้น หากคุณคือเจ้าของ กรุณาล็อกอินก่อนนะ</p>
                    <div className="flex flex-col gap-3">
                        <Link href="/login" className="bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all">
                        ไปหน้าล็อกอิน
                        </Link>
                        <Link href="/" className="text-gray-400 text-sm hover:underline">
                        กลับหน้าหลัก
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-10">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/" className="bg-white border w-10 h-10 flex items-center justify-center rounded-full shadow-sm hover:shadow-md transition">
                    🏠
                </Link>
                <h1 className="text-3xl font-bold">จัดการเทมเพลต</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ฝั่งซ้าย: ข้อมูลพื้นฐาน */}
                <div className="space-y-6 bg-white p-6 rounded-2xl border shadow-sm">
                    <h2 className="text-lg font-semibold border-b pb-2 text-gray-700">1. ข้อมูลเทมเพลต</h2>
                    <div>
                        <label className="block text-sm font-medium mb-1">ชื่อเทมเพลต</label>
                        <input className="w-full border p-2 rounded-lg" placeholder="เช่น Card สวยๆ" value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">หมวดหมู่</label>
                        <input className="w-full border p-2 rounded-lg" value={category} onChange={e => setCategory(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 py-2">
                        <input type="checkbox" id="personal" checked={isPersonal} onChange={e => setIsPersonal(e.target.checked)} />
                        <label htmlFor="personal" className="text-sm font-medium">ตั้งเป็นเทมเพลตส่วนตัว (Personal Use)</label>
                    </div>
                    {isPersonal && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium mb-1">รหัสผ่านสำหรับแก้ไข</label>
                            <input type="password" className="w-full border p-2 rounded-lg" placeholder="ตั้งรหัสผ่านที่นี่" value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1 italic text-blue-600">HTML Blueprint (ใช้ {"{{key}}"} แทนตัวแปร)</label>
                        <textarea className="w-full border p-2 rounded-lg h-48 font-mono text-xs" 
                            placeholder="<div class='card'>{{name}}</div>"
                            value={htmlBlueprint} onChange={e => setHtmlBlueprint(e.target.value)} 
                        />
                    </div>
                </div>

                {/* ฝั่งขวา: จัดการ Fields */}
                <div className="space-y-6 bg-gray-50 p-6 rounded-2xl border">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h2 className="text-lg font-semibold text-gray-700">2. กำหนดช่องกรอกข้อมูล</h2>
                        <button onClick={addField} className="text-sm bg-blue-500 text-white px-3 py-1 rounded-full hover:bg-blue-600">+ เพิ่มช่อง</button>
                    </div>
                
                    {fields.map((field, index) => (
                        <div key={index} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3 relative">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-400">Label (หัวข้อที่แสดง)</label>
                                    <input className="w-full border p-1 rounded text-sm" placeholder="เช่น ชื่อเล่น" value={field.label} onChange={e => updateField(index, 'label', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Key (ต้องตรงกับใน HTML)</label>
                                    <input className="w-full border p-1 rounded text-sm font-mono" placeholder="เช่น nickname" value={field.field_key} onChange={e => updateField(index, 'field_key', e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">ประเภท</label>
                                <select className="w-full border p-1 rounded text-sm" value={field.type} onChange={e => updateField(index, 'type', e.target.value)}>
                                    <option value="text">ข้อความทั่วไป (Text)</option>
                                    <option value="bbcode">BBCode (สำหรับกล่องข้อความยาวๆ)</option>
                                </select>
                            </div>
                            <button onClick={() => setFields(fields.filter((_, i) => i !== index))} className="text-xs text-red-400 hover:text-red-600 absolute top-2 right-2 underline">ลบออก</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-10 flex justify-center">
                <button 
                    disabled={loading || !title || !htmlBlueprint}
                    onClick={handleSave}
                    className="bg-black text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-gray-800 disabled:bg-gray-300 transition-all shadow-xl"
                >
                    {loading ? "กำลังบันทึก..." : "บันทึกเทมเพลตเข้าคลัง 🚀"}
                </button>
            </div>
        </div>
    );
}