"use client";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-md border border-(--primary) bg-(--background) p-6 font-Google-Code animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="mb-4 flex items-center justify-between border-b border-(--primary)/20 pb-3">
                    <h3 className="text-base md:text-lg mt-[-4px] uppercase tracking-widest text-(--primary)">
                        {title}
                    </h3>
                    <button onClick={onClose} className="hover:text-(--primary) transition-colors cursor-pointer select-none">
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="text-sm">
                    {children}
                </div>
            </div>
        </div>
    );
}