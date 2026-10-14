// Leaderboard extras: worst-offender banner, monogram badges, tap a row to open its report.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (b) => (window.gwBrand ? window.gwBrand(b) : String(b || '').replace(/\s*\(.*?\)\s*/g, ' ').trim());
  const mono = (b) => { const w = clean(b).replace(/&/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : (w[0] || '')[1] || '')).toUpperCase(); };
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  let data = null; const bySlug = {};
  async function load() { try { data = await (await fetch('api/leaderboard')).json(); (data.brands || []).forEach((b) => (bySlug[clean(b.brand).toLowerCase()] = b)); decorate(); } catch {} }
  function banner() {
    const lb = document.getElementById('leaderboard'); if (!lb || !data || !(data.brands || []).length) return;
    const worst = [...data.brands].sort((a, b) => a.score - b.score || (b.tally?.misleading || 0) - (a.tally?.misleading || 0))[0];
    let el = lb.querySelector('.lb-worst');
    const html = `<span class="lbw-badge" style="--h:${hue(worst.brand)}">${esc(mono(worst.brand))}</span>
      <div class="lbw-main"><span class="lbw-kicker">Worst offender this week</span><b>${esc(clean(worst.brand))}</b>
      <small>${worst.tally?.misleading || 0} misleading · ${worst.tally?.unsubstantiated || 0} unsubstantiated of ${worst.claims} claims · our assessment</small></div>
      <span class="lbw-score"><b>${worst.score}</b><small>/100</small></span><span class="lbw-go" aria-hidden="true">→</span>`;
    if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'lb-worst'; const list = lb.querySelector('.lb-filter'); list.parentNode.insertBefore(el, list); }
    el.innerHTML = html; el.dataset.slug = worst.slug; el.setAttribute('aria-label', `Open report: ${clean(worst.brand)}, worst offender`);
  }
  function decorate() {
    banner();
    document.querySelectorAll('#leaderboard .lb-row').forEach((row) => {
      const name = row.querySelector('.lb-top b'); if (!name) return; if (name.textContent !== clean(name.textContent)) name.textContent = clean(name.textContent);
      const b = bySlug[clean(name.textContent).toLowerCase()];
      if (!row.querySelector('.lb-mono')) row.querySelector('.lb-rank').insertAdjacentHTML('afterend', `<span class="lb-mono" style="--h:${hue(name.textContent)}" aria-hidden="true">${esc(mono(name.textContent))}</span>`);
      if (b && !row.dataset.slug) { row.dataset.slug = b.slug; row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `Open report: ${clean(b.brand)}`); }
    });
  }
  async function open(slug, el) {
    if (!slug || typeof showReport !== 'function') return;
    el && el.classList.add('loading');
    try {
      const rec = await (await fetch('api/recent/' + slug)).json(); if (!rec || !rec.report) return;
      document.getElementById('progress').className = 'progress hidden';
      showReport(rec.report, false, `Saved ${new Date(rec.saved_at).toLocaleDateString()}`);
      const rep = document.getElementById('report');
      (window.__lenis ? window.__lenis.scrollTo(rep, { offset: -80 }) : rep.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } finally { el && el.classList.remove('loading'); }
  }
  document.addEventListener('click', (e) => { const r = e.target.closest('#leaderboard .lb-row[data-slug], #leaderboard .lb-worst'); if (r) open(r.dataset.slug, r); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const r = e.target.closest && e.target.closest('#leaderboard .lb-row[data-slug]'); if (r) { e.preventDefault(); open(r.dataset.slug, r); } });
  const watch = () => { const l = document.querySelector('#leaderboard .lb-list'); if (!l) return setTimeout(watch, 300); if (!l.children.length) l.innerHTML = '<li class="lb-sk"></li>'.repeat(4); new MutationObserver(decorate).observe(l, { childList: true }); decorate(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { load(); watch(); }); else { load(); watch(); }
})();
