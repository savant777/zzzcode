export default function SkeletonCard() {
    return (
        <div className="zzzcode-card-item p-2 bg-(--primary)/15 transition-all group flex flex-col relative animate-pulse">
            <div className="aspect-square w-full bg-(--primary)/25"></div>
            <h3 className="text-2xl leading-none truncate bg-(--primary)/25">&nbsp;</h3>
            <p className="text-sm leading-tight font-Google-Sans min-h-8 bg-(--primary)/25 max-w-3/4">&nbsp;</p>
            <div className="flex flex-wrap gap-1 items-stretch overflow-hidden">
                <div className="min-w-8 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap bg-(--primary)/25">&nbsp;</div>
                <div className="min-w-8 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap bg-(--primary)/25">&nbsp;</div>
                <div className="min-w-8 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap bg-(--primary)/25">&nbsp;</div>
            </div>
            <div className="flex justify-between items-center">
                <div className="flex items-center min-w-[24px]">
                    <div className="p-1.5 bg-(--primary)/25">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"></svg>
                    </div>
                </div>
                <div className="flex gap-1">
                    <div className="p-1.5 bg-(--primary)/25">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"></svg>
                    </div>
                </div>
            </div>
        </div>
    );
}