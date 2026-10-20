export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary anonymous probe: no user credentials or service-role key.
export async function GET() {
    const started = performance.now();
    let upstreamStatus = 0;
    try {
        const result = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/template_catalog`, {
            method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
            headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
        });
        upstreamStatus = result.status;
        await result.text();
    } catch { /* Report timing and failure without leaking upstream details. */ }
    const upstreamMs = Math.round(performance.now() - started);
    return Response.json({ upstreamMs, upstreamStatus, region: process.env.VERCEL_REGION ?? 'local' }, {
        status: upstreamStatus >= 200 && upstreamStatus < 300 ? 200 : 502,
        headers: { 'Cache-Control': 'no-store', 'Server-Timing': `supabase;dur=${upstreamMs}` },
    });
}
