"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Home() {
    const [user, setUser] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        
        const fetchTemplates = async () => {
            let query = supabase.from('templates').select('*');
            
            if (!user) {
                query = query.eq('is_active', true);
            }
            
            const { data } = await query;
            if (data) setTemplates(data);
        };
        fetchTemplates();
    }, []);
    
    return (
        <main className="p-10">
            <div className="flex justify-between items-center mb-10">
                <h1 className="text-4xl font-black italic">MY CODE LIBRARY</h1>
        
                {/* ถ้าล็อกอินอยู่ ให้โชว์ปุ่มสร้างและปุ่มล็อกเอาต์ */}
                {user ? (
                    <div className="flex gap-4">
                        <Link href="/create" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 shadow-lg transition-all">
                        + สร้างเทมเพลตใหม่
                        </Link>
                        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="text-gray-400 text-sm underline">
                        Logout
                        </button>
                    </div>
                ) : (
                    <Link href="/login" className="text-gray-300 hover:text-gray-600 text-sm">Admin Access</Link>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {templates?.map((item) => (
                    <div key={item.id} className="border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-gray-200 h-40 flex items-center justify-center">
                            {item.preview_url ? (
                                <img src={item.preview_url} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-gray-400">ไม่มีรูปพรีวิว</span>
                            )}
                        </div>
                        <div className="p-4">
                            <h2 className="text-xl font-bold">{item.title}</h2>
                            <span className="inline-block bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded mt-1">
                                {item.category}
                            </span>
                            <div className="relative group">
                            <Link href={`/editor/${item.id}`}>
                                <button className="w-full mt-4 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition-colors">
                                    {item.is_personal ? '🔒 ต้องใช้รหัสผ่าน' : 'เริ่มแก้ไข'}
                                </button>
                            </Link>
                            {user && (
                                <Link href={`/edit/${item.id}`} className="absolute top-2 right-2 bg-white/90 p-2 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition">
                                    ✏️ แก้ไข
                                </Link>
                            )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    )
}