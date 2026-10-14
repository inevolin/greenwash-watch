// Per-claim provenance: "Found at domain ↗" + capture date + optional page snapshot (tap to enlarge).
// Never fabricates a URL: claims without a valid http(s) source_url show "source: agent research".
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let snaps = {};
  const ready = fetch('api/snaps').then((r) => (r.ok ? r.json() : {})).then((j) => { snaps = j || {}; }).catch(() => {});
  const okUrl = (u) => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; } };
  const host = (x) => x.hostname.replace(/^www\./, '');
  const fmt = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  window.__gwCapturedAt = null;
  // c: claim; opts.captured: when our agents captured it; opts.label override; opts.compact: no thumbnail
  window.gwSource = (c, opts = {}) => {
    const u = okUrl(c.source_url || c.url);
    const cap = opts.captured === false ? '' : fmt(opts.captured || window.__gwCapturedAt);
    const date = cap ? `<span class="src-date">captured ${esc(cap)}</span>` : '';
    if (!u) return `<div class="src src-none"><span class="src-k">Source</span> agent research ${date}</div>`;
    const s = snaps[u.href] || snaps[String(c.source_url).trim()];
    const thumb = !opts.compact && s && s.file ? `<button type="button" class="src-thumb" data-snap="snaps/${esc(s.file)}" data-href="${esc(u.href)}" aria-label="Enlarge snapshot of ${esc(host(u))}"><img src="snaps/${esc(s.file)}" alt="" loading="lazy" width="96" height="60"></button>` : '';
    const title = c.source_title ? `<span class="src-title">${esc(c.source_title)}</span>` : '';
    const ex = c.quoted_excerpt && !opts.compact ? `<blockquote class="src-ex">“${esc(String(c.quoted_excerpt).replace(/^["“]|["”]$/g, ''))}”</blockquote>` : '';
    return `<div class="src">${thumb}<div class="src-meta"><span class="src-k">${esc(opts.label || 'Found at')}</span> <a href="${esc(u.href)}" target="_blank" rel="noopener nofollow">${esc(host(u))} ↗</a> ${date}${title}${ex}</div></div>`;
  };
  window.gwSourcesReady = ready;
  // Lightbox
  const box = document.createElement('dialog'); box.id = 'snapbox'; box.className = 'snapbox';
  box.innerHTML = '<button class="x" aria-label="Close">×</button><img alt=""><a target="_blank" rel="noopener nofollow"></a>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.src-thumb');
    if (t) { e.preventDefault(); e.stopPropagation(); box.querySelector('img').src = t.dataset.snap; const a = box.querySelector('a'); a.href = t.dataset.href; a.textContent = 'Open original page ↗'; if (!box.isConnected) document.body.appendChild(box); box.showModal(); return; }
    if (e.target === box || e.target.closest('.snapbox .x')) box.close();
  }, true);
})();
