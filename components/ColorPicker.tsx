"use client";
import React, { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";

export default function ColorPicker({ color, onChange }: { color: string, onChange: (newColor: string) => void }) {
    const [isOpen, toggle] = useState(false);
    const popover = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popover.current && !popover.current.contains(event.target as Node)) {
                toggle(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative">
            <div
                className="w-10 h-10 border border-(--primary)/50 cursor-pointer shrink-0 overflow-hidden"
                style={{ backgroundColor: color }}
                onClick={() => toggle(true)}
            />

            {isOpen && (
                <div className="absolute z-10 mt-2 p-3 bg-(--background) border border-(--primary)/50" ref={popover}>
                    <HexColorPicker color={color} onChange={onChange} />
                </div>
            )}
        </div>
    );
}