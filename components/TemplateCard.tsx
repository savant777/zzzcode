"use client";
import { useRouter } from 'next/navigation';

export default function TemplateCard({ item, viewMode, isAdmin, onTagClick, onDelete, onOpenPrivateModal }: any) {
    const router = useRouter();

    const handleUseTemplate = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (item.is_personal) {
            onOpenPrivateModal(item);
            return;
        }

        router.push(`/editor/${item.id}`);
    };

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        router.push(`/edit/${item.id}`);
    };

    if (viewMode === 'line') {
        return (
            <div className="zzzcode-list-item border border-(--primary) p-2 bg-(--background) transition-all group relative items-center">
                {/* Preview Image + Orange Filter */}
                <div className="hidden md:block aspect-square w-full overflow-hidden border border-(--primary)/20 relative after:content-[''] after:absolute after:inset-0 after:mix-blend-color after:bg-(--primary) after:opacity-100 after:select-none after:pointer-events-none group-hover:after:opacity-0 after:transition-all after:duration-500">
                    <img 
                        src={item.preview_url || '/placeholder.png'} 
                        className="w-full h-full object-cover transition-all duration-500 saturate-0 group-hover:filter-none group-hover:scale-105"
                        alt={item.title}
                    />
                </div>

                {/* Info */}
                <div className="flex flex-col gap-2 h-full md:py-2 md:pt-1">
                    {/* Name */}
                    <h3 className="flex-1 md:flex-none content-center md:content-normal text-(--primary) md:text-2xl leading-none uppercase">
                        {item.title}
                    </h3>

                    {/* Description */}
                    <p className="hidden md:block flex-1 text-(--foreground)/75 text-sm leading-tight font-Google-Sans truncate">
                        {item.description}
                    </p>

                    {/* Tags */}
                    <div className="hidden md:flex flex-wrap gap-1 items-stretch">
                        {item.template_tags.map((t: any) => (
                            <button 
                                key={t.tags.slug}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTagClick(t.tags.name); 
                                }}
                                className="border border-(--foreground) bg-(--foreground) text-(--background) px-1.5 py-0.5 text-xs font-bold lowercase hover:bg-(--background) hover:text-(--foreground) transition-all duration-300 ease-in-out cursor-pointer whitespace-nowrap"
                            >
                                {t.tags.name}
                            </button>
                        ))}
                    </div>
                </div>
                
                {/* Buttons */}
                <div className="flex flex-wrap gap-1 items-center">
                    <div className="flex items-center min-w-[28px]">
                        {item.is_personal && (
                            <div title="Private Code" className="p-1.5 border border-(--primary)/30 text-(--background) bg-(--primary)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleUseTemplate}
                        title="Use Template"
                        className="p-1.5 border border-(--primary)/30 text-(--primary) hover:bg-(--primary) hover:text-black transition-colors duration-300 ease cursor-pointer"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </button>

                    {isAdmin && (
                        <>
                            <button
                                onClick={handleEditClick} 
                                title="Edit Template"
                                className="p-1.5 border border-(--primary)/30 text-(--primary) hover:bg-(--primary) hover:text-black transition-colors duration-300 ease  cursor-pointer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                title="Delete / Deactivate"
                                className="p-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-300 ease cursor-pointer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }
    
    return (
        <div className="zzzcode-card-item border border-(--primary) p-2 bg-(--background) transition-all group relative">
            {/* Preview Image + Orange Filter */}
            <div className="aspect-square w-full overflow-hidden border border-(--primary)/20 relative after:content-[''] after:absolute after:inset-0 after:mix-blend-overlay after:bg-(--primary) after:opacity-100 after:select-none after:pointer-events-none group-hover:after:opacity-0 after:transition-all after:duration-500">
                <img 
                    src={item.preview_url || '/placeholder.png'} 
                    className="w-full h-full object-cover transition-all duration-500 saturate-0 group-hover:filter-none group-hover:scale-105"
                    alt={item.title}
                />
            </div>
            {/* Name */}
            <h3 className="text-(--primary) text-2xl leading-none uppercase">
                {item.title}
            </h3>

            {/* Description */}
            <p className="text-(--foreground)/75 text-sm leading-tight font-Google-Sans min-h-8">
                {item.description}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 items-stretch">
                {item.template_tags?.slice(0, 2).map((t: any) => (
                    <button 
                        key={t.tags.slug}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTagClick(t.tags.name); 
                        }}
                        className="border border-(--foreground) bg-(--foreground) text-(--background) px-1.5 py-0.5 text-xs font-bold lowercase hover:bg-(--background) hover:text-(--foreground) transition-all duration-300 ease-in-out cursor-pointer whitespace-nowrap"
                    >
                        {t.tags.name}
                    </button>
                ))}

                {item.template_tags?.length > 2 && (
                    <div className="group/tooltip flex relative">
                        <button className="border border-(--foreground) bg-(--background) text-(--foreground) px-1.5 py-0.5 text-xs font-bold hover:bg-(--foreground) hover:text-(--background) transition-all cursor-help">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="19" cy="12" r="1"></circle>
                                <circle cx="5" cy="12" r="1"></circle>
                            </svg>
                        </button>
                        
                        <div className="invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 absolute bottom-full left-0 mb-2 p-2 bg-(--background) border border-(--primary) z-50 min-w-[120px] transition-all duration-200">
                            <div className="text-xs uppercase opacity-50 mb-1 border-b border-(--primary)/20 pb-1">Additional Tags</div>
                            <div className="flex flex-wrap gap-1">
                                {item.template_tags?.slice(2).map((t: any) => (
                                    <button 
                                        key={t.tags.slug}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTagClick(t.tags.name); 
                                        }}
                                        className="cursor-pointer text-(--primary) text-[10px] font-bold"
                                    >
                                        #{t.tags.name}
                                    </button>
                                ))}
                            </div>
                            <div className="absolute top-full left-4 w-2 h-2 bg-(--background) border-r border-b border-(--primary) rotate-45 -translate-y-1"></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Buttons */}
            <div className="flex justify-between items-center">
                <div className="flex items-center min-w-[28px]">
                    {item.is_personal && (
                        <div title="Private Code" className="p-1.5 border border-(--primary)/30 text-(--background) bg-(--primary)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                    )}
                </div>

                <div className="flex gap-1">
                    <button 
                        onClick={handleUseTemplate}
                        title="Use Template"
                        className="p-1.5 border border-(--primary)/30 text-(--primary) hover:bg-(--primary) hover:text-black transition-colors duration-300 ease cursor-pointer"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </button>

                    {isAdmin && (
                        <>
                            <button
                                onClick={handleEditClick}
                                title="Edit Template"
                                className="p-1.5 border border-(--primary)/30 text-(--primary) hover:bg-(--primary) hover:text-black transition-colors duration-300 ease  cursor-pointer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                title="Delete / Deactivate"
                                className="p-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-300 ease cursor-pointer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}