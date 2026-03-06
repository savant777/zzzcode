export default function SkeletonNav() {
    return (
        <div className="flex flex-col border-b border-(--primary)/20">
            <div className="w-full p-2 px-3 tracking-widest flex justify-between items-center">
                <div className="bg-(--primary)/25 min-w-3/4">&nbsp;</div>
                <div className="bg-(--primary)/25 min-w-[24px]">&nbsp;</div>
            </div>

            <div className="grid grid-template-rows-[1fr]">
                <div className="overflow-hidden">
                    <div className="flex flex-col">
                        <div className="w-full p-2 px-6 text-sm border-t border-(--primary)/20 flex items-center gap-2">
                            <div className="bg-(--primary)/25 min-w-1/2">&nbsp;</div>
                        </div>
                        <div className="w-full p-2 px-6 text-sm border-t border-(--primary)/20 flex items-center gap-2">
                            <div className="bg-(--primary)/25 min-w-1/2">&nbsp;</div>
                        </div>
                        <div className="w-full p-2 px-6 text-sm border-t border-(--primary)/20 flex items-center gap-2">
                            <div className="bg-(--primary)/25 min-w-1/2">&nbsp;</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}