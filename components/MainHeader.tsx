"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CreatorSession, getCurrentCreator } from '@/lib/creator';
import TypingHeader from './TypingHeader';
import Modal from './Modal';

const creatorMenuItems = [
    { href: '/create', symbol: '+', label: 'Add Template' },
    { href: '/creator/tags', symbol: '#', label: 'Manage Tags' },
    { href: '/creator/profile', symbol: '*', label: 'Profile' },
];

function MenuLabel({ symbol, label, flipSymbol = false }: { symbol: string; label: string; flipSymbol?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>
                [<span className={`inline-block w-[1em] text-center ${flipSymbol ? 'rotate-90 -scale-y-100 translate-x-12/100' : ''}`}>{symbol}</span>]
            </span>
            <span>{label}</span>
        </span>
    );
}

export default function MainHeader() {
    const [isLoading, setIsLoading] = useState(true);
    const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [modalType, setModalType] = useState<'login' | 'logout' | null>(null);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const loadCreatorSession = async () => {
        const session = await getCurrentCreator();
        setCreatorSession(session);
        setIsLoading(false);
    };

    useEffect(() => {
        loadCreatorSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            loadCreatorSession();
        });

        return () => subscription.unsubscribe();
    }, []);

    const isCreator = !!creatorSession?.isCreator;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
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

    const closeMenu = () => setIsMenuOpen(false);

    return (
        <header className="header-grid-area relative flex items-center gap-3 p-2 border-b border-(--primary) text-(--primary) bg-(--background)">
            <TypingHeader text="zzzcode editor" speed={100} />

            {!isLoading && (
                <div className="ml-auto flex items-center justify-end animate-in fade-in duration-300 font-Google-Code text-xs uppercase">
                    <div className="hidden lg:flex items-center gap-4">
                        {isCreator ? (
                            <>
                                {creatorMenuItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className="px-2 py-1 hover:bg-(--primary)/10 transition-colors"
                                    >
                                        <MenuLabel symbol={item.symbol} label={item.label} />
                                    </Link>
                                ))}
                                <button
                                    onClick={() => setModalType('logout')}
                                    className="px-2 py-1 hover:bg-(--primary)/10 transition-colors cursor-pointer uppercase"
                                >
                                    <MenuLabel symbol="↵" label="Logout" flipSymbol />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setModalType('login')}
                                className="px-2 py-1 hover:bg-(--primary)/10 transition-colors cursor-pointer uppercase"
                            >
                                <MenuLabel symbol="↵" label="Login" />
                            </button>
                        )}
                    </div>

                    <div className="lg:hidden">
                        {isCreator ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setIsMenuOpen(prev => !prev)}
                                    className="border border-(--primary) p-2 flex h-8 w-8 items-center justify-center leading-none hover:bg-(--primary)/10 transition-colors cursor-pointer"
                                    aria-label="Toggle menu"
                                    aria-expanded={isMenuOpen}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        {isMenuOpen ? (
                                            <>
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </>
                                        ) : (
                                            <>
                                                <line x1="4" y1="7" x2="20" y2="7"></line>
                                                <line x1="4" y1="12" x2="20" y2="12"></line>
                                                <line x1="4" y1="17" x2="20" y2="17"></line>
                                            </>
                                        )}
                                    </svg>
                                </button>

                                {isMenuOpen && (
                                    <div className="absolute right-2 top-full z-50 mt-2 min-w-40 border border-(--primary) bg-(--background) shadow-lg">
                                        {creatorMenuItems.map(item => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={closeMenu}
                                                className="block border-b border-(--primary)/20 px-3 py-2 hover:bg-(--primary)/10 transition-colors"
                                            >
                                                <MenuLabel symbol={item.symbol} label={item.label} />
                                            </Link>
                                        ))}
                                        <button
                                            onClick={() => {
                                                closeMenu();
                                                setModalType('logout');
                                            }}
                                            className="w-full px-3 py-2 text-left hover:bg-(--primary)/10 transition-colors cursor-pointer uppercase"
                                        >
                                            <MenuLabel symbol="↵" label="Logout" flipSymbol />
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => setModalType('login')}
                                className="px-2 py-1 hover:bg-(--primary)/10 transition-colors cursor-pointer uppercase"
                            >
                                <MenuLabel symbol="↵" label="Login" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <Modal
                isOpen={modalType !== null}
                onClose={() => setModalType(null)}
                title={modalType === 'login' ? 'Creator Authentication' : 'Creator Logout'}
            >
                {modalType === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-4 text-(--foreground)">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Creator_Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="creator@zzzcode.dev"
                                className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Creator_Secret_Key</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="******"
                                className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="cursor-pointer w-full bg-(--primary) text-black py-2 font-bold uppercase mt-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Initializing...' : 'Initialize_Creator_Session'}
                        </button>
                    </form>
                )}

                {modalType === 'logout' && (
                    <div className="space-y-6">
                        <p className="text-(--foreground) opacity-80">Are you sure you want to terminate the current creator session?</p>
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
