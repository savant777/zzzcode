"use client";
import Link from 'next/link';

interface BreadcrumbsProps {
    path?: string;
    currentFile?: string;
    editorMode?: string;
}

export default function Breadcrumbs({ path, currentFile, editorMode }: BreadcrumbsProps) {
    const [group, value] = path ? path.split(':') : [null, null];

    const isDashboard = path && !currentFile && !editorMode;

    return (
        <div className="flex flex-wrap items-center gap-2 gap-y-0 font-Google-Code text-[10px] md:text-xs uppercase select-none tracking-wider">
            <Link href="/?group=category&tag=all" className="text-(--foreground)/75 hover:text-(--primary) transition-colors">
                ZZZCODE_EDITOR
            </Link>

            {/* --- Add --- */}
            {editorMode === 'CREATE' && !path && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className="text-(--primary) font-bold">CREATE_TEMPLATE</span>
                </>
            )}

            {/* --- Dashboard / Edit / Editor) --- */}
            {group && value && (
                <>
                    {/* TAG GROUP (only in Dashboard) */}
                    {isDashboard && (
                        <>
                            <span className="text-(--foreground)/25">/</span>
                            <span className="text-(--foreground)/75">{group.replace(/-/g, '_').toUpperCase()}</span>
                        </>
                    )}

                    {/* TAG / VALUE */}
                    <span className="text-(--foreground)/25">/</span>
                    {/* in Editor Page */}
                    {!isDashboard ? (
                        <Link 
                            href={`/?group=${group.toLowerCase()}&tag=${value.toLowerCase()}`}
                            className="text-(--foreground)/75 hover:text-(--primary) transition-colors"
                        >
                            {value.replace(/-/g, '_').toUpperCase()}
                        </Link>
                    ) : (
                        /* ถ้าเป็นหน้า Dashboard ก้อนนี้คือตัวสุดท้าย -> สีส้ม */
                        <span className="text-(--primary) font-bold">{value.replace(/-/g, '_').toUpperCase()}</span>
                    )}
                </>
            )}

            {/* --- TEMPLATE NAME (Edit / Editor) --- */}
            {currentFile && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className={`${!editorMode ? 'text-(--primary) font-bold' : 'text-(--foreground)/75'}`}>
                        {currentFile.replace(/\s+/g, '_')}
                    </span>
                </>
            )}

            {/* --- EDITOR / EDIT --- */}
            {editorMode && editorMode !== 'CREATE' && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className="text-(--primary) font-bold">{editorMode}</span>
                </>
            )}
        </div>
    );
}