"use client";

import { useEffect, useRef } from 'react';

type AutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function AutoResizeTextarea({ value, onChange, className = '', ...props }: AutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const resize = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    useEffect(() => {
        resize();
    }, [value]);

    return (
        <textarea
            {...props}
            ref={textareaRef}
            value={value}
            onChange={(e) => {
                onChange?.(e);
                requestAnimationFrame(resize);
            }}
            className={`${className} overflow-hidden resize-none`}
        />
    );
}
