// Size the viewport from the browser/panel, never from document content.
export function previewViewport(width: number, height: number, panelWidth: number, panelHeight: number, profile: 'roleplayth' | 'hogthai' = 'roleplayth', contentWidth = 760) {
    // RoleplayTH has no mobile viewport meta: retain its 980px layout viewport.
    // vw/media queries use this width, independently of the editor panel.
    const layoutWidth = profile === 'roleplayth' ? Math.max(980, width) : width;
    // Match #mainwidth's left margin and the forum's 15px vertical scrollbar.
    const forumMainWidth = layoutWidth - 100 - 15;
    const forumContainerWidth = layoutWidth <= 1350
        ? forumMainWidth - 30
        : Math.min(forumMainWidth * 0.9, layoutWidth >= 1800 ? 1550 : Infinity);
    // The member column is 230px; .stposts adds 15px of right padding.
    // Approximation fitted to measured Hogthai desktop widths; minimum measured at 768px.
    const postBodyWidth = profile === 'hogthai'
        ? Math.max(760, width * 0.98 - 211.01)
        : Math.max(500, forumContainerWidth - 230 - 15);
    // Hogthai's wide forum column is surrounding space, not a reason to shrink
    // fixed-width templates on desktop. Show its centre at native size instead.
    const fittingWidth = profile === 'hogthai' ? Math.max(760, contentWidth) : postBodyWidth;
    const scale = Math.max(0.01, Math.min(panelWidth / fittingWidth, 1));
    const visibleWidth = Math.min(Math.max(postBodyWidth, fittingWidth), panelWidth / scale);
    return { postBodyWidth, visibleWidth, viewportWidth: Math.max(layoutWidth, postBodyWidth + (profile === 'hogthai' ? 16 : 0)), scale,
        iframeHeight: Math.max(1, Math.floor(Math.min(height, panelHeight / scale))) };
}
