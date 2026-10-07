"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export default function LivePreview({ html, profile = 'roleplayth' }: { html: string; profile?: 'roleplayth' | 'hogthai' }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const latestHtmlRef = useRef(html);
    const [scale, setScale] = useState(1);
    const [iframeHeight, setIframeHeight] = useState(500);
    const [viewportWidth, setViewportWidth] = useState(1440);
    const [postBodyWidth, setPostBodyWidth] = useState(961);
    const [visibleWidth, setVisibleWidth] = useState(961);
    const [contentCenter, setContentCenter] = useState<number | null>(null);
    const updateSizingRef = useRef<() => void>(() => {});

    useLayoutEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const availableWidth = containerRef.current.offsetWidth;
                const availableHeight = containerRef.current.clientHeight;
                if (availableWidth <= 0 || availableHeight <= 0) return;
                const doc = iframeRef.current?.contentDocument;
                if (profile === 'hogthai' && doc) {
                    const layout = previewViewport(window.innerWidth, window.innerHeight, availableWidth, availableHeight, profile);
                    doc.documentElement.style.setProperty('--preview-layout-width', layout.viewportWidth + 'px');
                    doc.documentElement.style.setProperty('--preview-post-width', layout.postBodyWidth + 'px');
                }
                const post = doc?.querySelector<HTMLElement>('[data-preview-content]');
                let contentWidth = 760;
                let center: number | null = null;
                if (profile === 'hogthai' && post) {
                    // Measure horizontal content only. The forum column remains
                    // unchanged; height must never grow the iframe viewport.
                    const boxes = Array.from(post.querySelectorAll<HTMLElement>('*'))
                        .filter(el => !['BR', 'LINK', 'STYLE', 'SCRIPT'].includes(el.tagName))
                        .map(el => el.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
                    if (boxes.length) {
                        const left = Math.min(...boxes.map(rect => rect.left));
                        const right = Math.max(...boxes.map(rect => rect.right));
                        contentWidth = right - left;
                        center = (left + right) / 2;
                    }
                }
                const next = previewViewport(window.innerWidth, window.innerHeight, availableWidth, availableHeight, profile, contentWidth);
                setViewportWidth(next.viewportWidth);
                setPostBodyWidth(next.postBodyWidth);
                setVisibleWidth(next.visibleWidth);
                setScale(next.scale);
                setIframeHeight(next.iframeHeight);
                setContentCenter(center);
            }
        };
        updateSizingRef.current = updateScale;

        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);
        
        window.addEventListener('resize', updateScale);
        window.visualViewport?.addEventListener('resize', updateScale);
        window.addEventListener('pageshow', updateScale);
        updateScale();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateScale);
            window.visualViewport?.removeEventListener('resize', updateScale);
            window.removeEventListener('pageshow', updateScale);
        };
    }, [profile]);

    // Keep srcDoc stable while resizing: reloading it races with mobile viewport changes.
    const postBodyWidthRef = useRef(postBodyWidth);
    useLayoutEffect(() => {
        postBodyWidthRef.current = postBodyWidth;
        iframeRef.current?.contentDocument?.documentElement.style.setProperty('--preview-post-width', postBodyWidth + 'px');
        if (profile === 'hogthai') updateSizingRef.current();
    }, [postBodyWidth]);

    const updatePreviewHtml = () => {
        const iframe = iframeRef.current;
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        const postBody = doc?.querySelector('[data-preview-content]');

        if (!doc || !postBody) return;
        doc.documentElement.style.setProperty('--preview-post-width', postBodyWidthRef.current + 'px');

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
            link.onload = () => updateSizingRef.current();
            doc.head.appendChild(link);
        });

        postBody.innerHTML = bodyHtml;
        if (profile === 'hogthai') updateSizingRef.current();
    };

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        let contentObserver: ResizeObserver | undefined;
        const handleIframeLoad = () => {
            updatePreviewHtml();
            if (profile === 'hogthai') {
                contentObserver?.disconnect();
                contentObserver = new ResizeObserver(() => updateSizingRef.current());
                const post = iframe.contentDocument?.querySelector('[data-preview-content]');
                if (post) contentObserver.observe(post);
            }
        };
        iframe.addEventListener('load', handleIframeLoad);
        handleIframeLoad();
        return () => {
            iframe.removeEventListener('load', handleIframeLoad);
            contentObserver?.disconnect();
        };
    }, []);
    useEffect(() => {
        latestHtmlRef.current = html;
        updatePreviewHtml();
    }, [html]);

    const styles = profile === 'hogthai' ? `<style>
        html { margin:0; padding:0; width:var(--preview-layout-width,1440px); overflow-x:visible; }
        body { margin:0; padding:0; width:100%; overflow-x:visible; }
        body { background:#121212; color:#FFFFCC; font-family:Verdana,Tahoma,Arial,'Trebuchet MS',sans-serif,Georgia,Courier,'Times New Roman',serif; font-size:12px; line-height:normal; text-align:center; }
        .preview-post { display:table; width:var(--preview-post-width,760px); margin:0 auto; padding-top:8px; background:#121212; text-align:left; font-size:13px; line-height:135%; }
        .preview-post-cell { display:table-cell; padding:5px; }
        .postcolor { font-size:13px; line-height:160%; margin-top:8px; margin-left:8px; }
        #dohtml_span { display:block; }
        ::-webkit-scrollbar { display:none; }
    </style>` : `
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/uicons-bold-rounded/css/uicons-bold-rounded.css">
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/2.4.0/uicons-solid-rounded/css/uicons-solid-rounded.css">
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/uicons-regular-rounded/css/uicons-regular-rounded.css">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans+Thai:wght@100..900&family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap');
            
            html,
            body {
                width: 100%;
                min-width: 100%;
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
                width: var(--preview-post-width, 605px);
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

    const cropOffset = profile === 'hogthai' && contentCenter !== null
        ? contentCenter - visibleWidth / 2
        : Math.max(0, (viewportWidth - visibleWidth) / 2) + (profile === 'hogthai' ? 8 : 0);
    const scaledWidth = visibleWidth * scale;
    // The iframe itself must include overflowing fixed-width templates. Keeping
    // its CSS layout width separate prevents expansion from changing centering.
    const renderWidth = profile === 'hogthai'
        ? Math.max(viewportWidth, cropOffset + visibleWidth)
        : viewportWidth;
    const scaledHeight = iframeHeight * scale;

    return (
        <div ref={containerRef} className="w-full h-full min-h-0 flex-1 overflow-hidden">
            <div 
                style={{
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                    margin: '0 auto',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <iframe
                    title="Live preview"
                    ref={iframeRef}
                    srcDoc={`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body>${profile === 'hogthai' ? '<div class="preview-post"><div class="preview-post-cell"><div class="postcolor" data-preview-content></div></div></div>' : '<div class="post_body scaleimages" data-preview-content></div>'}</body></html>`}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: `-${cropOffset * scale}px`,
                        width: `${renderWidth}px`,
                        height: `${iframeHeight}px`,
                        border: 'none',
                        display: 'block',
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                    }}
                />
            </div>
        </div>
    );
}
