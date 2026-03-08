"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TypingHeaderProps {
    text: string;
    speed?: number;
}

export default function TypingHeader({ text, speed = 150 }: TypingHeaderProps) {
    const [displayedText, setDisplayedText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timer = setTimeout(() => {
                setDisplayedText((prev) => prev + text[currentIndex]);
                setCurrentIndex((prev) => prev + 1);
            }, speed);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, text, speed]);

    return (
        <Link href="/?group=category&tag=all" className="flex justify-center items-center py-2 md:py-0">
            <h1 className="text-2xl md:text-5xl leading-none uppercase">
                {displayedText}
                <span className="animate-cursor-blink">_</span>
            </h1>
        </Link>
    );
}