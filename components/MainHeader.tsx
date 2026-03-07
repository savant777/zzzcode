"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import TypingHeader from './TypingHeader';
import Modal from './Modal';

export default function MainHeader() {
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const checkUser = async () => {
            const { data } = await supabase.auth.getUser();
            setUser(data.user);
            setIsLoading(false);
        };

        checkUser();
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);
    
    const [modalType, setModalType] = useState<'login' | 'logout' | null>(null);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                alert(`Authentication Error: ${error.message}`);
            } else {
                setModalType(null);
                setEmail('');
                setPassword('');
                window.location.reload();
            }
        } catch (err) {
            console.error("Login unexpected error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        await supabase.auth.signOut();
        window.location.reload();
    };

    return (
        <header className="header-grid-area flex p-2 border-b border-(--primary) text-(--primary) bg-(--background)">
            <TypingHeader text="zzzcode editor" speed={100} />
            {!isLoading && (
                <div className="flex gap-2 flex-1 justify-end animate-in fade-in duration-300">
                    {user ? (
                        <>
                            <Link href="/create" className="border border-(--primary) p-2 px-3 flex justify-center items-center font-Google-Code leading-none aspect-square hover:bg-(--primary)/10 transition-colors ">+</Link>
                            <button 
                                onClick={() => setModalType('logout')} 
                                className="border border-(--primary) p-2 px-3 flex justify-center items-center font-Google-Code leading-none hover:bg-(--primary)/10 transition-colors cursor-pointer"
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <button 
                            onClick={() => setModalType('login')}
                            className="border border-(--primary) p-2 px-3 flex justify-center items-center font-Google-Code leading-none hover:bg-(--primary)/10 transition-colors cursor-pointer"
                        >
                            Admin
                        </button>
                    )}
                </div>
            )}
            
            <Modal 
                isOpen={modalType !== null} 
                onClose={() => setModalType(null)}
                title={modalType === 'login' ? 'System Authentication' : 'Terminal Logout'}
            >
                {modalType === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-4 text-(--foreground)">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Admin_Email</label>
                            <input 
                                type="email" 
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="root@zzzcode.dev" 
                                className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Secret_Key</label>
                            <input 
                                type="password" 
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="⋆⋆⋆⋆⋆⋆" 
                                className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75" 
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="cursor-pointer w-full bg-(--primary) text-black py-2 font-bold uppercase mt-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Initializing...' : 'Initialize_Session'}
                        </button>
                    </form>
                )}

                {modalType === 'logout' && (
                    <div className="space-y-6">
                        <p className="text-(--foreground) opacity-80">Are you sure you want to terminate the current administrative session?</p>
                        <div className="flex gap-2">
                            <button onClick={() => setModalType(null)} className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors">Abort</button>
                            <button 
                                onClick={handleLogout}
                                disabled={loading}
                                className="cursor-pointer flex-1 py-2 bg-(--primary) text-black font-bold uppercase text-xs hover:brightness-110 disabled:opacity-50"
                            >
                                {loading ? 'Terminating...' : 'Confirm_Exit'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </header>
    );
}