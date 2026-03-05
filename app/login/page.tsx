"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const router = useRouter();

    const handleLogin = async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else router.push('/');
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="p-8 bg-white rounded-2xl shadow-sm border w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
                <input type="email" placeholder="Email" className="w-full border p-3 rounded-lg mb-4" onChange={e => setEmail(e.target.value)} />
                <input type="password" placeholder="Password" className="w-full border p-3 rounded-lg mb-6" onChange={e => setPassword(e.target.value)} />
                <div className="flex flex-col gap-3">
                    <button onClick={handleLogin} className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800">เข้าสู่ระบบ</button>
                    <Link href="/" className="text-gray-400 text-sm hover:underline">
                        กลับหน้าหลัก
                    </Link>
                </div>
            </div>
        </div>
    );
}