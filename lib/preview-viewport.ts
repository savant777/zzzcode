// Size the viewport from the browser/panel, never from document content.
export function previewViewport(width: number, height: number, panelWidth: number, panelHeight: number, profile: 'roleplayth' | 'hogthai' = 'roleplayth', contentWidth = 760) {
    // Approximation fitted to measured Hogthai desktop widths; minimum measured at 768px.
    const postBodyWidth = profile === 'hogthai' ? Math.max(760, width * 0.98 - 211.01) : width < 990 ? 605 : 961;
    // Hogthai's wide forum column is surrounding space, not a reason to shrink
    // fixed-width templates on desktop. Show its centre at native size instead.
    const fittingWidth = profile === 'hogthai' ? Math.max(760, contentWidth) : postBodyWidth;
    const scale = Math.max(0.01, Math.min(panelWidth / fittingWidth, 1));
    const visibleWidth = Math.min(Math.max(postBodyWidth, fittingWidth), panelWidth / scale);
    return { postBodyWidth, visibleWidth, viewportWidth: Math.max(width, postBodyWidth + (profile === 'hogthai' ? 16 : 0)), scale,
        iframeHeight: Math.max(1, Math.floor(Math.min(height, panelHeight / scale))) };
}
