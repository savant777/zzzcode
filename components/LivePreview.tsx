"use client";
import { useEffect, useRef, useState } from 'react';

interface Props {
    html: string;
}

export default function LivePreview({ html }: { html: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1);
    const [iframeHeight, setIframeHeight] = useState(500);
    const [currentTargetWidth, setCurrentTargetWidth] = useState(961);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const availableWidth = containerRef.current.offsetWidth;

                const target = window.innerWidth < 990 ? 605 : 961;
                setCurrentTargetWidth(target);

                const newScale = Math.min(availableWidth / target, 1);
                setScale(newScale);
            }
        };

        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);
        
        window.addEventListener('resize', updateScale);
        updateScale();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateScale);
        };
    }, []);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const handleIframeLoad = () => {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc) {
                const observer = new MutationObserver(() => {
                    setIframeHeight(doc.body.scrollHeight);
                });
                observer.observe(doc.body, { childList: true, subtree: true, attributes: true });
                setIframeHeight(doc.body.scrollHeight);
            }
        };

        iframe.addEventListener('load', handleIframeLoad);
        handleIframeLoad();
        
        return () => iframe.removeEventListener('load', handleIframeLoad);
    }, [html]);

    const styles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans+Thai:wght@100..900&display=swap');
            
            body { 
                background: #131313;
                color: #fff; 
                margin: 0; 
                padding: 20px; 
                font-family: 'Inter', 'Noto Sans Thai', sans-serif;
                line-height: 1.4;
                min-height: 100vh;
            }

            .post_body { 
                padding: 12px 0; 
                line-height: 1.8; 
                font-size: 17px; 
                word-break: break-word;
                margin: 0 auto;
            }

            .scaleimages img { max-width: 100%; }
            img {
                border: none;
                vertical-align: middle;
            }

            hr { color: #fff; background: #303030; height: 1px; border: 0px; margin: 1em 0; }
            a { color: rgb(43, 120, 255); text-decoration: none; transition: .3s; }
            a:hover { text-decoration: underline; }

            ::-webkit-scrollbar { display: none; }
        </style>
    `;

    return (
        <div ref={containerRef} className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
            <div 
                style={{
                    width: `${currentTargetWidth}px`,
                    height: `${iframeHeight}px`,
                    transform: `scale(${scale}) translateX(${( (containerRef.current?.offsetWidth || 0) / scale - currentTargetWidth ) / 2}px)`,
                    transformOrigin: 'top left',
                    transition: 'transform 0.2s ease-out',
                }}
            >
                <iframe
                    ref={iframeRef}
                    srcDoc={`<!DOCTYPE html><html><head>${styles}</head><body><div class="post_body scaleimages">${html}</div></body></html>`}
                    style={{
                        width: `${currentTargetWidth}px`,
                        height: `${iframeHeight}px`,
                        border: 'none',
                    }}
                />
            </div>
            <div style={{ height: `${(iframeHeight * scale) - iframeHeight}px` }} />
        </div>
    );
}