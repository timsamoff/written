// ==========================================================================
// Written — shared pill/badge markup
// ==========================================================================
// Single source for the genre/theme "pill" fragment, used by both the
// reading portal (index.js) and the admin panel (admin.js), which
// previously each hand-rebuilt this identical markup independently.
//
// Style contract:
// - Container: wrap the returned pills in an element with class
//   "pill-container" (flex, gap — see style.css's .toc-tags
//   .pill-container / .reading-header .pill-container rules).
// - Text is escaped internally; callers must NOT pre-escape.
// - Coloring intentionally uses the single "universal" token trio
//   (--pill-bg-universal, --pill-text-universal, --pill-border-universal)
//   rather than per-genre/per-theme coloring — this is deliberate, not
//   an oversight, so don't "fix" it into per-tag colors without knowing
//   that. See CLAUDE.md's Design tokens section for why
//   --pill-text-universal is intentionally identical across themes.

function escapeHtmlForPill(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderPill(text) {
    return `<span class="pill">${escapeHtmlForPill(text)}</span>`;
}

function renderPills(tags) {
    return (tags || []).map(renderPill).join('\n');
}
