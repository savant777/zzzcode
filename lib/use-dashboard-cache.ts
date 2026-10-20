'use client';
import { useEffect, useState } from 'react';
import { DASHBOARD_CACHE_CHANGED } from './dashboard-cache';

export function useDashboardCacheVersion() {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const refresh = () => setVersion(value => value + 1);
        window.addEventListener(DASHBOARD_CACHE_CHANGED, refresh);
        return () => window.removeEventListener(DASHBOARD_CACHE_CHANGED, refresh);
    }, []);
    return version;
}
