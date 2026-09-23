"use client";
import Link from 'next/link';
import { getGroupSlug } from '@/lib/routes';

interface BreadcrumbsProps {
    path?: string;
    currentFile?: string;
    editorMode?: string;
}

export default function Breadcrumbs({ path, currentFile, editorMode }: BreadcrumbsProps) {
    const [rawGroup, rawValue] = path ? path.split(':') : ['', ''];
    const group = getGroupSlug(rawGroup);
    const value = (rawValue || '').toLowerCase();

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
                    {isDashboard && (
                        <>
                            <span className="text-(--foreground)/25">/</span>
                            <Link
                                href={`/?${new URLSearchParams({ group, tag: 'all' })}`}
                                className="text-(--foreground)/75 hover:text-(--primary) transition-colors"
                            >
                                {group.replace(/-/g, '_').toUpperCase()}
                            </Link>
                        </>
                    )}

                    {/* TAG / VALUE */}
                    <span className="text-(--foreground)/25">/</span>
                    {/* in Editor Page */}
                    {!isDashboard ? (
                        <Link 
                            href={`/?${new URLSearchParams({ group, tag: value })}`}
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
