"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SideNav from '@/components/SideNav';
import TemplateDashboard from '@/components/TemplateDashboard';
import { binHeaders } from '@/lib/bin-client';
export default function BinDashboard({ hogthai = false }: { hogthai?: boolean }) {
    const router = useRouter();
    const [navOpen, setNavOpen] = useState(true);
    const [ready, setReady] = useState(false), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { setReady(!!binHeaders()['X-Bin-Token']); }, []);
    if (ready) return <TemplateDashboard bin hogthai={hogthai} />;
    return <div className="grid main-grid-layout main-grid-area relative h-full overflow-hidden font-Google-Code">
        <SideNav isOpen={navOpen} setIsOpen={setNavOpen} activeFilter="bin:all" bin hogthai={hogthai} />
        <main className="section-grid-area relative h-full min-w-0 overflow-y-auto flex items-center justify-center p-4">
            {!navOpen && <button onClick={() => setNavOpen(true)} className="absolute top-4 left-0 border border-(--primary) p-2 text-(--primary) cursor-pointer">►</button>}
            <section className="w-full max-w-md border border-(--primary) bg-(--background) p-6">
                <div className="mb-4 flex items-center justify-between border-b border-(--primary)/20 pb-3">
                    <h1 className="text-base md:text-lg mt-[-4px] uppercase tracking-widest text-(--primary)">Authentication Required</h1>
                    <button type="button" aria-label="Back to dashboard" onClick={() => router.push(hogthai ? '/hogthai' : '/')} className="hover:text-(--primary) transition-colors cursor-pointer select-none">✕</button>
                </div>
        <form className="space-y-4" onSubmit={async event => {
            event.preventDefault(); if (busy) return; setBusy(true); setError('');
            try {
                const result = await fetch('/api/bin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(30000) });
                const body = await result.json(); if (!result.ok) throw new Error(body.error || 'Bin unavailable');
                localStorage.setItem('zzzcode_bin', body.token); setPassword(''); setReady(true);
            } catch (error) { setError(error instanceof Error ? error.message : 'Bin unavailable'); } finally { setBusy(false); }
        }}>
            <div className="flex items-center gap-2 text-(--primary) mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-xs uppercase font-bold tracking-widest">Security_Check</span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">หน้า <span className="text-(--primary)">&quot;.bin&quot;</span> ถูกล็อกไว้<br />กรุณาระบุรหัสผ่านเพื่อเข้าถึงหน้า .bin</p>
            <input aria-label="Bin password" autoFocus required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="ENTER_SECRET_KEY..." className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none focus:border-(--primary)/75" />
            {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2"><button type="button" onClick={() => router.push(hogthai ? '/hogthai' : '/')} className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors">ABORT</button><button disabled={busy} className="cursor-pointer flex-1 py-2 bg-(--primary) text-black font-bold uppercase text-xs hover:brightness-110 disabled:opacity-50">{busy ? 'VERIFYING...' : 'UNLOCK_ACCESS'}</button></div>
        </form>
            </section>
        </main>
    </div>;
}
