export default function PageLoading({ label = 'Loading_Page...' }: { label?: string }) {
    return (
        <main className="main-grid-area flex min-h-0 h-full flex-col overflow-hidden px-4 pb-4 pt-4 font-Google-Code">
            <div role="status" aria-live="polite" className="flex min-h-40 flex-1 items-center justify-center border border-dashed border-(--primary)/10 text-[10px] uppercase tracking-widest text-(--foreground)/40 select-none">
                <span className="motion-safe:animate-pulse">{label}</span>
            </div>
        </main>
    );
}
