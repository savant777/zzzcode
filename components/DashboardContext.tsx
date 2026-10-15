"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { usePathname } from 'next/navigation';

type DashboardPage = { pathname: string; hogthai: boolean } | null;
const DashboardContext = createContext<{
    href: string;
    setPage: Dispatch<SetStateAction<DashboardPage>>;
}>({ href: '/?group=category&tag=all', setPage: () => {} });

export function DashboardProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [page, setPage] = useState<DashboardPage>(null);
    const hogthai = pathname === '/hogthai' || (page?.pathname === pathname && page.hogthai);
    return <DashboardContext.Provider value={{ href: hogthai ? '/hogthai' : '/?group=category&tag=all', setPage }}>
        {children}
    </DashboardContext.Provider>;
}

export function useTemplateDashboard(hogthai: boolean) {
    const pathname = usePathname();
    const { setPage } = useContext(DashboardContext);
    useEffect(() => {
        setPage({ pathname, hogthai });
        return () => setPage(current => current?.pathname === pathname ? null : current);
    }, [pathname, hogthai, setPage]);
}

export function useDashboardHref() {
    return useContext(DashboardContext).href;
}
