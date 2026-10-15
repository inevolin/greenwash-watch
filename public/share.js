// Shareable verdict card: canvas → PNG, Web Share on touch devices, download fallback.
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 1200, H = 630;
  const vCls = (v) => (/hold/i.test(v) ? 'ok' : /unsub|commit/i.test(v) ? 'uns' : 'mis');
  const COL = { ok: '#2f7d55', uns: '#b8862f', mis: '#c4623f' };
  const unq = (s) => String(s ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  const score = (r) => { const c = r.claims || []; if (!c.length) return null; const v = c.reduce((a, x) => a + (vCls(x.verdict) === 'ok' ? 1 : vCls(x.verdict) === 'uns' ? 0.5 : 0), 0); return Math.round((v / c.length) * 100); };
  const top = (r) => { const c = r.claims || []; return c.find((x) => vCls(x.verdict) === 'mis') || c.find((x) => vCls(x.verdict) === 'uns') || c[0]; };
  const clean = (b) => String(b || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; if (lines.length === maxLines) break; } else line = t; }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) { let l = lines[maxLines - 1]; while (ctx.measureText(l + '…”').width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l.replace(/[\s,;:]+$/, '') + '…'; }
    return lines;
  }
  function render(r) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const serif = '"Tiempos Headline","Iowan Old Style",Palatino,Georgia,serif', sans = 'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif';
    x.fillStyle = '#f4f1eb'; x.fillRect(0, 0, W, H);
    // card
    const rr = (X, Y, w, h, rad) => { x.beginPath(); x.moveTo(X + rad, Y); x.arcTo(X + w, Y, X + w, Y + h, rad); x.arcTo(X + w, Y + h, X, Y + h, rad); x.arcTo(X, Y + h, X, Y, rad); x.arcTo(X, Y, X + w, Y, rad); x.closePath(); };
    x.save(); x.shadowColor = 'rgba(31,30,29,.18)'; x.shadowBlur = 40; x.shadowOffsetY = 14; rr(40, 40, W - 80, H - 80, 28); x.fillStyle = '#fff'; x.fill(); x.restore();
    rr(40, 40, W - 80, H - 80, 28); x.strokeStyle = '#e3ddd2'; x.lineWidth = 2; x.stroke();
    const t = top(r) || {}, k = vCls(t.verdict), s = score(r);
    // header
    x.fillStyle = '#2f7d55'; x.beginPath(); x.arc(92, 98, 10, 0, 7); x.fill();
    x.fillStyle = '#1f1e1d'; x.font = `600 22px ${sans}`; x.fillText('Greenwashing', 112, 106); const gw = x.measureText('Greenwashing ').width;
    x.font = `italic 400 24px ${serif}`; x.fillText('Watchdog', 112 + gw, 106);
    x.fillStyle = '#87847c'; x.font = `600 15px ${sans}`; x.textAlign = 'right'; x.fillText('VERDICT CARD · ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(), W - 92, 104); x.textAlign = 'left';
    x.fillStyle = '#eee8de'; x.fillRect(80, 132, W - 160, 2);
    // brand
    x.fillStyle = '#1f1e1d'; let fs = 76; x.font = `400 ${fs}px ${serif}`; const brand = clean(r.brand); while (x.measureText(brand).width > 760 && fs > 44) { fs -= 4; x.font = `400 ${fs}px ${serif}`; } x.fillText(brand, 80, 220);
    // score ring
    if (s != null) {
      const cx = W - 180, cy = 230, R = 74, col = s >= 70 ? COL.ok : s >= 40 ? COL.uns : COL.mis;
      x.lineWidth = 14; x.strokeStyle = '#efe9df'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = col; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, s / 100)); x.stroke(); x.lineCap = 'butt';
      x.fillStyle = '#1f1e1d'; x.textAlign = 'center'; x.font = `400 58px ${serif}`; x.fillText(String(s), cx, cy + 18);
      x.fillStyle = '#87847c'; x.font = `600 13px ${sans}`; x.fillText('INTEGRITY SCORE', cx, cy + R + 40); x.textAlign = 'left';
    }
    // claim
    x.fillStyle = '#87847c'; x.font = `600 14px ${sans}`; x.fillText('TOP CLAIM UNDER REVIEW', 80, 282);
    x.fillStyle = '#4a4844'; x.font = `400 30px ${serif}`; const lines = wrap(x, '“' + unq(t.claim) + '”', 760, 3);
    lines.forEach((l, i) => x.fillText(l, 80, 318 + i * 38));
    // stamp
    const sy = 312 + lines.length * 38; x.save(); x.translate(80, sy); x.rotate(-0.06);
    x.font = `700 26px ${sans}`; const label = String(t.verdict || '').toUpperCase().slice(0, 34); const lw = x.measureText(label).width + 36;
    x.strokeStyle = COL[k]; x.lineWidth = 3; rr(0, 0, lw, 52, 8); x.stroke(); x.fillStyle = COL[k]; x.fillText(label, 18, 36); x.restore();
    // tally + footer
    const c = r.claims || [], n = (v) => c.filter((q) => vCls(q.verdict) === v).length;
    x.fillStyle = '#87847c'; x.font = `500 17px ${sans}`;
    x.fillText(`${c.length} claims reviewed · ${n('ok')} hold up · ${n('uns')} unsubstantiated · ${n('mis')} misleading`, 80, H - 102);
    x.fillStyle = '#eee8de'; x.fillRect(80, H - 122, W - 160, 2);
    x.fillStyle = '#a39d92'; x.font = `500 15px ${sans}`; x.fillText('Our assessment, not a legal finding · nevolin.be/greenwashing-watchdog', 80, H - 74);
    return cv;
  }
  function toast(msg) {
    let t = document.querySelector('.gw-toast'); if (!t) { t = document.createElement('div'); t.className = 'gw-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  async function share(r, btn) {
    btn && btn.classList.add('busy');
    try {
      const cv = render(r); const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      const name = `greenwashing-watchdog-${clean(r.brand).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const touch = matchMedia('(hover: none)').matches;
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${clean(r.brand)} · Greenwashing Watchdog`, text: `Our assessment of ${clean(r.brand)}'s green claims`, url: location.origin + location.pathname }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Verdict card saved');
    } finally { btn && btn.classList.remove('busy'); }
  }
  window.__gwShare = { render, share, score };
  // Inject a Share button above the report header once app.js has rendered it.
  window.addEventListener('gw:report', (e) => {
    const r = e.detail; if (!r || !(r.claims || []).length) return;
    setTimeout(() => {
      const rep = document.getElementById('report'); if (!rep || rep.querySelector('.share-bar')) return;
      const s = score(r);
      const bar = document.createElement('div'); bar.className = 'share-bar';
      bar.innerHTML = `${s != null ? `<span class="share-score"><b>${s}</b><small>Integrity<br>score</small></span>` : ''}<button type="button" class="ct-btn primary share-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>Share verdict</button>`;
      const h3 = rep.querySelector('h3'); h3 ? h3.parentNode.insertBefore(bar, h3.nextSibling) : rep.prepend(bar);
      bar.querySelector('.share-btn').onclick = (ev) => share(r, ev.currentTarget);
    }, 0);
  });
})();
