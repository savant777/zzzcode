"use client";

import { useCallback, useEffect, useRef } from 'react';

type AutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    resizeMode?: 'change' | 'once';
};

export default function AutoResizeTextarea({ value, onChange, onPaste, resizeMode = 'change', className = '', ...props }: AutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasResizedOnce = useRef(false);

    const resize = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    const resizeOnce = useCallback(() => {
        if (hasResizedOnce.current) return;
        resize();
        hasResizedOnce.current = true;
    }, [resize]);

    useEffect(() => {
        if (resizeMode === 'change') {
            resize();
            return;
        }

        if (value) {
            requestAnimationFrame(resizeOnce);
        }
    }, [resize, resizeMode, resizeOnce, value]);

    return (
        <textarea
            {...props}
            ref={textareaRef}
            value={value}
            onChange={(e) => {
                onChange?.(e);
                if (resizeMode === 'change') {
                    requestAnimationFrame(resize);
                }
            }}
            onPaste={(e) => {
                onPaste?.(e);
                if (resizeMode === 'once') {
                    requestAnimationFrame(resizeOnce);
                }
            }}
            className={`${className} overflow-hidden resize-none`}
        />
    );
}
