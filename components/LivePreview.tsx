"use client";
import { useEffect, useRef, useState } from 'react';

export default function LivePreview({ html }: { html: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1);
    const [iframeHeight, setIframeHeight] = useState(500);
    const [viewportWidth, setViewportWidth] = useState(1440);
    const [postBodyWidth, setPostBodyWidth] = useState(961);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const availableWidth = containerRef.current.offsetWidth;
                const realViewportWidth = Math.max(window.innerWidth, 1);
                const nextPostBodyWidth = realViewportWidth < 990 ? 605 : 961;
                const nextViewportWidth = Math.max(realViewportWidth, nextPostBodyWidth);

                setContainerWidth(availableWidth);
                setViewportWidth(nextViewportWidth);
                setPostBodyWidth(nextPostBodyWidth);

                const newScale = Math.min(availableWidth / nextPostBodyWidth, 1);
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
            
            if (doc && doc.body) {
                const observer = new MutationObserver(() => {
                    if (doc.body) {
                        setIframeHeight(doc.body.scrollHeight);
                    }
                });

                observer.observe(doc.body, { 
                    childList: true, 
                    subtree: true, 
                    attributes: true 
                });

                setIframeHeight(doc.body.scrollHeight);

                return () => observer.disconnect();
            }
        };

        iframe.addEventListener('load', handleIframeLoad);

        const cleanup = handleIframeLoad();
        
        return () => {
            iframe.removeEventListener('load', handleIframeLoad);
            if (cleanup) cleanup();
        };
    }, [html]);

    const styles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans+Thai:wght@100..900&display=swap');
            
            html,
            body {
                width: ${viewportWidth}px;
                min-width: ${viewportWidth}px;
                margin: 0;
            }

            body { 
                background: #131313;
                color: #fff; 
                padding: 20px 0; 
                font-family: 'Inter', 'Noto Sans Thai', sans-serif;
                line-height: 1.4;
                box-sizing: border-box;
            }

            .post_body { 
                width: ${postBodyWidth}px;
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
            .hidden-content-title {
                margin-top: 10px;
                font-size: 22px;
                color: red;
                text-align: center;
            }
            .hidden-content-body {
                background: #000;
                padding: 15px;
                border-radius: 6px;
                color: white;
            }

            ::-webkit-scrollbar { display: none; }
        </style>
    `;

    const cropOffset = Math.max(0, (viewportWidth - postBodyWidth) / 2);
    const scaledWidth = postBodyWidth * scale;
    const scaledHeight = iframeHeight * scale;

    return (
        <div ref={containerRef} className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
            <div 
                style={{
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                    margin: '0 auto',
                    overflow: 'visible',
                    transition: 'width 0.2s ease-out, height 0.2s ease-out',
                }}
            >
                <div
                    style={{
                        width: `${postBodyWidth}px`,
                        height: `${iframeHeight}px`,
                        overflow: 'hidden',
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        transition: 'transform 0.2s ease-out',
                    }}
                >
                    <iframe
                        ref={iframeRef}
                        srcDoc={`<!DOCTYPE html><html><head>${styles}</head><body><div class="post_body scaleimages">${html}</div></body></html>`}
                        style={{
                            width: `${viewportWidth}px`,
                            height: `${iframeHeight}px`,
                            border: 'none',
                            marginLeft: `-${cropOffset}px`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
