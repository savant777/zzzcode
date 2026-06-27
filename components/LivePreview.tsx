"use client";
import { useEffect, useRef, useState } from 'react';

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
    const observerRef = useRef<MutationObserver | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const heightFrameRef = useRef<number | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const measureIframeHeight = (doc: Document) => {
        const body = doc.body;
        const postBody = doc.querySelector<HTMLElement>('.post_body');

        if (body && postBody) {
            const bodyStyle = doc.defaultView?.getComputedStyle(body);
            const bodyPaddingBottom = Number.parseFloat(bodyStyle?.paddingBottom || '0') || 0;

            return Math.ceil(Math.max(
                postBody.offsetTop + postBody.scrollHeight + bodyPaddingBottom,
                postBody.offsetTop + postBody.offsetHeight + bodyPaddingBottom,
                1
            ));
        }

        const root = doc.documentElement;
        return Math.ceil(Math.max(
            body?.scrollHeight || 0,
            body?.offsetHeight || 0,
            root?.scrollHeight || 0,
            root?.offsetHeight || 0,
            postBody ? postBody.offsetTop + postBody.scrollHeight : 0,
            postBody ? postBody.offsetTop + postBody.offsetHeight : 0,
            1
        ));
    };

    const updateIframeHeight = (doc: Document) => {
        if (heightFrameRef.current) cancelAnimationFrame(heightFrameRef.current);

        heightFrameRef.current = requestAnimationFrame(() => {
            if (doc.body && doc.documentElement) {
                setIframeHeight(measureIframeHeight(doc));
            }
        });
    };

    const scheduleHeightRetries = (doc: Document) => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

        const delays = [50, 150, 350, 700, 1200];
        let index = 0;

        const run = () => {
            updateIframeHeight(doc);
            index += 1;
            if (index < delays.length) {
                retryTimerRef.current = setTimeout(run, delays[index]);
            }
        };

        retryTimerRef.current = setTimeout(run, delays[index]);
    };

    const watchLateLoadingAssets = (doc: Document) => {
        const update = () => {
            updateIframeHeight(doc);
            scheduleHeightRetries(doc);
        };

        doc.querySelectorAll<HTMLImageElement>('img').forEach(img => {
            if (img.complete) return;
            img.addEventListener('load', update, { once: true });
            img.addEventListener('error', update, { once: true });
        });

        doc.head.querySelectorAll<HTMLLinkElement>('link[data-live-preview-stylesheet="true"]').forEach(link => {
            link.addEventListener('load', update, { once: true });
            link.addEventListener('error', update, { once: true });
        });

        doc.fonts?.ready.then(update).catch(() => undefined);
    };

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
        updateIframeHeight(doc);
        watchLateLoadingAssets(doc);
        scheduleHeightRetries(doc);
    };

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const handleIframeLoad = () => {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;

            observerRef.current?.disconnect();

            if (!doc?.body) return;

            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = new ResizeObserver(() => updateIframeHeight(doc));
            resizeObserverRef.current.observe(doc.body);
            if (doc.documentElement) resizeObserverRef.current.observe(doc.documentElement);

            observerRef.current = new MutationObserver(() => updateIframeHeight(doc));
            observerRef.current.observe(doc.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            updatePreviewHtml();
        };

        iframe.addEventListener('load', handleIframeLoad);
        handleIframeLoad();
        
        return () => {
            iframe.removeEventListener('load', handleIframeLoad);
            observerRef.current?.disconnect();
            resizeObserverRef.current?.disconnect();
            if (heightFrameRef.current) cancelAnimationFrame(heightFrameRef.current);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        };
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

            hr { color: #fff; background-color: #303030; height: 1px; border: 0px; }
            a { color: rgb(43, 120, 255); text-decoration: none; transition: .3s; }
            a:hover { text-decoration: none; }
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
                        srcDoc={`<!DOCTYPE html><html><head>${styles}</head><body><div class="post_body scaleimages"></div></body></html>`}
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
