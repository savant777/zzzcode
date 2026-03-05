"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import TypingHeader from './TypingHeader';

export default function MainHeader() {
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <header className="zzzcode-grid-area flex justify-between p-2 border-b border-(--primary) text-(--primary) bg-(--background)">
            <TypingHeader text="zzzcode editor" speed={100} />
            {user ? (
                <div className="flex gap-2 flex-1 justify-end">
                    <Link href="/create" className="border border-(--primary) p-2 flex justify-center items-center font-Google-Code leading-none aspect-square">+</Link>
                    <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="border border-(--primary) p-2 flex justify-center items-center font-Google-Code leading-none cursor-pointer">
                        Logout
                    </button>
                </div>
            ) : (
                <Link href="/login" className="border border-(--primary) p-2 flex justify-center items-center font-Google-Code leading-none">Admin</Link>
            )}
        </header>
    );
}