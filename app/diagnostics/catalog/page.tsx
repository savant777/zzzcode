'use client';

import { useState } from 'react';

type Result = { round: number; directMs: number; directStatus: number; viaMs: number;
    upstreamMs: number; upstreamStatus: number; region: string };

export default function CatalogTimingPage() {
    const [results, setResults] = useState<Result[]>([]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const run = async () => {
        setRunning(true);
        setResults([]);
        setError('');
        try {
            for (let round = 1; round <= 3; round++) {
                const started = performance.now();
                const direct = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/template_catalog`, {
                    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
                    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
                        'Content-Type': 'application/json' },
                    body: '{}',
                });
                await direct.text();
                const directMs = Math.round(performance.now() - started);
                const viaStarted = performance.now();
                const via = await fetch('/api/diagnostics/catalog', { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
                const data = await via.json();
                setResults(previous => [...previous, { round, directMs, directStatus: direct.status,
                    viaMs: Math.round(performance.now() - viaStarted), ...data }]);
            }
        } catch { setError('วัดไม่ครบ: การเชื่อมต่อล้มเหลวหรือเกินเวลา ลองใหม่ได้'); }
        finally { setRunning(false); }
    };
    return <main className="main-grid-area overflow-auto p-6 text-(--primary)">
        <h1 className="text-2xl mb-4">วัดเวลา catalog</h1>
        <p>อ่านข้อมูลสาธารณะเดียวกันแบบไม่ล็อกอิน 3 รอบ ไม่มีการบันทึกข้อมูล</p>
        <p>เวลาเป็นมิลลิวินาที รวมรับข้อมูลครบ รอบแรกอาจรวมการเริ่มฟังก์ชันและเชื่อมต่อใหม่</p>
        <button className="border p-2 my-4 disabled:opacity-50" disabled={running} onClick={run}>
            {running ? 'กำลังวัด…' : 'เริ่มวัด 3 รอบ'}
        </button>
        <table className="w-full text-left border-collapse">
            <thead><tr>{['รอบ', 'เครื่อง → Supabase', 'เครื่อง → Vercel → Supabase', 'เฉพาะ Vercel → Supabase', 'Region Vercel', 'HTTP ตรง / ผ่าน Vercel'].map(label => <th className="border p-2" key={label}>{label}</th>)}</tr></thead>
            <tbody>{results.map(result => <tr key={result.round}>
                {[result.round, result.directMs, result.viaMs, result.upstreamMs, result.region,
                    `${result.directStatus} / ${result.upstreamStatus}`].map((value, index) => <td className="border p-2" key={index}>{value}</td>)}
            </tr>)}</tbody>
        </table>
        {error && <p role="alert">{error}</p>}
        <p className="mt-4">เทียบหลายรอบก่อนสรุป หน้านี้ไม่วัดเวลาวาด Dashboard หรือขั้นตอนล็อกอิน</p>
    </main>;
}
