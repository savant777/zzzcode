"use client";
import { useEffect, useRef, useState } from 'react';
import { previewViewport } from '@/lib/preview-viewport';

const stylesheetLinkRegex = /<link\b(?=[^>]*\brel=(["'])stylesheet\1)(?=[^>]*\bhref=(["'])(.*?)\2)[^>]*>/gi;

const extractStylesheetLinks = (html: string) => {
    const hrefs: string[] = [];
    const bodyHtml = html.replace(stylesheetLinkRegex, (_, _relQuote, _hrefQuote, href) => {
        if (href && !hrefs.includes(href)) hrefs.push(href);
        return '';
    });

    return { bodyHtml, hrefs };
};

export default function LivePreview({ html }: { html: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const latestHtmlRef = useRef(html);
    const [scale, setScale] = useState(1);
    const [iframeHeight, setIframeHeight] = useState(500);
    const [viewportWidth, setViewportWidth] = useState(1440);
    const [postBodyWidth, setPostBodyWidth] = useState(961);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const availableWidth = containerRef.current.offsetWidth;
                const availableHeight = containerRef.current.clientHeight;
                if (availableWidth <= 0 || availableHeight <= 0) return;
                const next = previewViewport(window.innerWidth, window.innerHeight, availableWidth, availableHeight);
                setViewportWidth(next.viewportWidth);
                setPostBodyWidth(next.postBodyWidth);
                setScale(next.scale);
                setIframeHeight(next.iframeHeight);
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

    const updatePreviewHtml = () => {
        const iframe = iframeRef.current;
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        const postBody = doc?.querySelector('.post_body');

        if (!doc || !postBody) return;

        const { bodyHtml, hrefs } = extractStylesheetLinks(latestHtmlRef.current);
        const existingLinks = Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[data-live-preview-stylesheet="true"]'));

        existingLinks.forEach(link => {
            if (!hrefs.includes(link.href) && !hrefs.includes(link.getAttribute('href') || '')) {
                link.remove();
            }
        });

        hrefs.forEach(href => {
            const hasLink = existingLinks.some(link => link.href === href || link.getAttribute('href') === href);
            if (hasLink) return;

            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.livePreviewStylesheet = 'true';
            doc.head.appendChild(link);
        });

        postBody.innerHTML = bodyHtml;
    };

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const handleIframeLoad = () => updatePreviewHtml();
        iframe.addEventListener('load', handleIframeLoad);
        handleIframeLoad();
        return () => iframe.removeEventListener('load', handleIframeLoad);
    }, []);
    useEffect(() => {
        latestHtmlRef.current = html;
        updatePreviewHtml();
    }, [html]);

    const styles = `
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/uicons-bold-rounded/css/uicons-bold-rounded.css">
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/2.4.0/uicons-solid-rounded/css/uicons-solid-rounded.css">
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/uicons-regular-rounded/css/uicons-regular-rounded.css">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans+Thai:wght@100..900&family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap');
            
            html,
            body {
                width: ${viewportWidth}px;
                min-width: ${viewportWidth}px;
                margin: 0;
            }

            html { overflow-y: auto; overflow-x: hidden; }

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

            hr { color: #fff; background-color: #303030; height: 1px; border: 0px; }
            a { color: rgb(43, 120, 255); text-decoration: none; transition: .3s; }
            a:hover { text-decoration: none; }
            .codeblock {
                color: rgb(255, 255, 255);
                font-size: 12px;
                background: rgb(32, 32, 32);
                margin: 10px 0;
                padding: 20px;
                border-radius: 6px !important;
            }
            .codeblock .title { display: none; }
            [dir="ltr" i] { unicode-bidi: isolate; }
            .codeblock code {
                height: auto;
                max-height: 200px;
                font-size: 13px;
                font-style: italic;
                text-align: justify;
                word-break: break-all;
            }
            blockquote {
                color: rgb(255, 255, 255);
                background: rgb(32, 32, 32);
                margin: 10px 0;
                padding: 20px;
                border-left: 6px solid rgb(79, 79, 79);
                border-radius: 6px !important;
            }

            .paper,
            .bpaper {
                max-width: 1200px;
                font-family: 'Sarabun', sans-serif;
                box-sizing: border-box;
                margin: auto;
                padding: 100px;
                text-shadow: none;
                font-style: normal;
                line-height: 1.8;
                font-size: 17px;
                text-align: justify;
                border-radius: 5px;
            }
            .paper {
                background: #f0f0f0;
                color: #000;
            }
            .bpaper {
                background: #0d0d0d;
                color: #f0f0f0;
            }

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
        <div ref={containerRef} className="w-full h-full min-h-0 flex-1 overflow-hidden">
            <div 
                style={{
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                    margin: '0 auto',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${postBodyWidth}px`,
                        height: `${iframeHeight}px`,
                        overflow: 'hidden',
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                    }}
                >
                    <iframe
                        title="Live preview"
                        ref={iframeRef}
                        srcDoc={`<!DOCTYPE html><html><head>${styles}</head><body><div class="post_body scaleimages"></div></body></html>`}
                        style={{
                            width: `${viewportWidth}px`,
                            height: `${iframeHeight}px`,
                            border: 'none',
                            display: 'block',
                            marginLeft: `-${cropOffset}px`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
