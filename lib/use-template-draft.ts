"use client";
import { useEffect, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';

export function useTemplateDraft(key: string, value: unknown, enabled: boolean, skip: { current: boolean }) {
    const latest = useRef({ value, enabled });
    useLayoutEffect(() => { latest.current = { value, enabled }; }, [value, enabled]);
    const save = () => {
        if (!latest.current.enabled || skip.current) return;
        try {
            localStorage.setItem(key, JSON.stringify(latest.current.value));
        } catch {
            toast.error('DRAFT_SAVE_FAILED: Copy your work before leaving this page.', {
                id: 'template-draft-save-failed', duration: Infinity,
            });
        }
    };
    const saveRef = useRef(save);
    useLayoutEffect(() => { saveRef.current = save; });
    useEffect(() => {
        const timer = setTimeout(() => saveRef.current(), 2000);
        return () => clearTimeout(timer);
    }, [value, enabled]);
    useEffect(() => {
        const flush = () => saveRef.current();
        const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
        window.addEventListener('pagehide', flush);
        window.addEventListener('zzzcode-save-draft', flush);
        document.addEventListener('visibilitychange', hidden);
        return () => {
            flush();
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('zzzcode-save-draft', flush);
            document.removeEventListener('visibilitychange', hidden);
        };
    }, [key]);
}
