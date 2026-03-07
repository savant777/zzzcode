"use client";
import Link from 'next/link';

interface BreadcrumbsProps {
    path?: string;
    currentFile?: string;
}

export default function Breadcrumbs({ path, currentFile }: BreadcrumbsProps) {
    const pathParts = path ? path.split('-') : [];
    const lastPathPart = pathParts.pop();
    const parentPath = pathParts.join(' / ');

    return (
        <div className="flex items-center gap-2 font-Google-Code text-[10px] md:text-xs uppercase select-none tracking-wider">
            <Link href="/" className="text-(--foreground)/75">ZZZCODE_EDITOR</Link>
            {parentPath && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className="text-(--foreground)/75">{parentPath}</span>
                </>
            )}
            {lastPathPart && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className={`${!currentFile ? 'text-(--primary) font-bold' : 'text-(--foreground)/75'}`}>
                        {lastPathPart}
                    </span>
                </>
            )}
            {currentFile && (
                <>
                    <span className="text-(--foreground)/25">/</span>
                    <span className="text-(--primary) font-bold">
                        {currentFile.replace(/\s+/g, '_')}
                    </span>
                </>
            )}
        </div>
    );
}