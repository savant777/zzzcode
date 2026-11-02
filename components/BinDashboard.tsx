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
            {!navOpen && <button onClick={() => setNavOpen(true)} className="absolute top-4 left-0 border border-(--primary) p-2 text-(--primary)">►</button>}
            <section className="w-full max-w-md border border-(--primary) bg-(--background) p-6">
                <h1 className="mb-4 border-b border-(--primary)/20 pb-3 text-lg uppercase tracking-widest text-(--primary)">.bin Authentication</h1>
        <form className="space-y-4" onSubmit={async event => {
            event.preventDefault(); if (busy) return; setBusy(true); setError('');
            try {
                const result = await fetch('/api/bin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(30000) });
                const body = await result.json(); if (!result.ok) throw new Error(body.error || 'Bin unavailable');
                localStorage.setItem('zzzcode_bin', body.token); setPassword(''); setReady(true);
            } catch (error) { setError(error instanceof Error ? error.message : 'Bin unavailable'); } finally { setBusy(false); }
        }}>
            <p className="text-(--primary) text-xs tracking-widest">SECURITY_CHECK / .BIN</p>
            <p className="text-xs text-white/60">กรอกรหัสเพื่อเข้าถึงเทมเพลตลับ</p>
            <input aria-label="Bin password" autoFocus required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="ENTER_SECRET_KEY..." className="w-full bg-black/20 border border-(--primary)/50 p-2 outline-none" />
            {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2"><button type="button" onClick={() => router.push(hogthai ? '/hogthai' : '/')} className="flex-1 py-2 border border-(--primary)/20 text-xs">ABORT</button><button disabled={busy} className="flex-1 py-2 bg-(--primary) text-black text-xs disabled:opacity-50">{busy ? 'VERIFYING...' : 'UNLOCK_ACCESS'}</button></div>
        </form>
            </section>
        </main>
    </div>;
}
