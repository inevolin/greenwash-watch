const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const vClass = (v) => (/hold/i.test(v) ? 'ok' : /unsub|commit/i.test(v) ? 'uns' : 'mis');
const unq = (s) => String(s ?? '').trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
const fmtDate = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : String(d || ''); };
const vSplit = (v) => { const m = String(v || '').match(/^([^(]+?)\s*\((.+)\)\s*$/); return m ? [m[1], m[2]] : [String(v || ''), '']; };
const prettyStep = (s) => {
  s = String(s || '')
    .replace(/https?:\/\/(?:www\.)?([^\/\s]+)\S*/gi, '$1')
    .replace(/\bwww\.([^\s\/]+)/gi, '$1')
    .replace(/\bweb_fetch\s+/gi, 'reading ')
    .replace(/\bweb_search\s+/gi, 'searching ')
    .replace(/\bwrite\s+\S+/gi, 'writing findings')
    .replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
      .replace(/\b(prosecutor|judge|defender|consultant)\b/gi, (w) => w[0].toUpperCase() + w.slice(1));
  }
  return s;
};
const BRAND_MAP = { nestle: 'Nestlé', 'nestlé': 'Nestlé', 'h&m': 'H&M', 'h-m': 'H&M', hm: 'H&M', bp: 'BP', hsbc: 'HSBC', 'hsbc uk': 'HSBC UK', klm: 'KLM', 'coca-cola': 'Coca-Cola', 'coca cola': 'Coca-Cola', ikea: 'IKEA', 'l\'oreal': 'L\'Oréal', loreal: 'L\'Oréal', 'l\'oréal': 'L\'Oréal', danone: 'Danone', unilever: 'Unilever', totalenergies: 'TotalEnergies', easyjet: 'easyJet' };
const gwBrand = (b) => { const s = String(b || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(); const k = s.toLowerCase(); if (BRAND_MAP[k]) return BRAND_MAP[k]; return s === k ? s.replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()) : s; };
window.gwBrand = gwBrand;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* scroll reveal + counters */
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  e.target.querySelectorAll('.count').forEach(countUp);
  io.unobserve(e.target);
}), { threshold: 0.2 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.setProperty('--i', i % 3); io.observe(el); });
function countUp(el) {
  if (el.dataset.done) return; el.dataset.done = 1;
  const to = +el.dataset.to, suf = el.dataset.suffix || '';
  if (reduced) { el.textContent = to + suf; return; }
  const t0 = performance.now(), d = 1400;
  const tick = (t) => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e) + suf; if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

/* gallery */
let cases = [];
async function loadCases() {
  cases = await (await fetch('api/cases')).json();
  const inds = ['All', ...new Set(cases.map((c) => c.industry))];
  $('#filters').innerHTML = inds.map((i, n) => `<button data-i="${esc(i)}" class="${n ? '' : 'on'}">${esc(i)}</button>`).join('');
  $('#filters').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x === b));
    render(b.dataset.i);
  };
  render('All');
}
function render(ind) {
  $('#grid').removeAttribute('aria-busy');
  $('#grid').innerHTML = cases.filter((c) => ind === 'All' || c.industry === ind).map((c, i) => `
    <button class="card" data-id="${esc(c.id)}" style="--i:${i}" aria-label="${esc(c.brand)}: ${esc(c.verdict)}">
      <div class="inner">
        <div class="face front"><span class="ind">${esc(c.industry)}</span><h3>${esc(c.brand)}</h3><q>${esc(unq(c.claim))}</q><span class="hint">Open details</span></div>
        <div class="face back ${vClass(c.verdict)}"><span class="verdict">${esc(vSplit(c.verdict)[0])}</span>${vSplit(c.verdict)[1] ? `<span class="vdetail">${esc(vSplit(c.verdict)[1])}</span>` : ''}<small>${esc(c.regulator)} · ${esc(fmtDate(c.date))}</small><span class="more">Details →</span></div>
      </div>
    </button>`).join('');
}
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  // Open the case file on tap/click. Mobile shows the verdict row inline (no flip overlay).
  const c = cases.find((x) => x.id === card.dataset.id);
  $('#modalBody').innerHTML = `<span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span><h2 style="font-size:2rem;margin-top:.4em">${esc(c.brand)}</h2>
    <dl><dt>Claim</dt><dd><q>${esc(unq(c.claim))}</q></dd><dt>Why</dt><dd>${esc(c.reason)}</dd>
    <dt>Body</dt><dd>${esc(c.regulator)} · ${esc(fmtDate(c.date))}</dd>
    <dt>Source</dt><dd><a href="${esc(safeUrl(c.source))}" target="_blank" rel="noopener">${esc(new URL(c.source).hostname)} ↗</a></dd></dl>`;
  openModal();
});
let lockY = 0;
function openModal() {
  lockY = window.scrollY;
  window.__lenis && window.__lenis.stop();
  document.documentElement.classList.add('modal-lock');
  Object.assign(document.body.style, { position: 'fixed', top: `-${lockY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
  $('#modal').showModal();
}
$('#modal').addEventListener('close', () => {
  document.documentElement.classList.remove('modal-lock');
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '', overflow: '' });
  window.scrollTo(0, lockY);
  window.__lenis && window.__lenis.start();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('.x')) $('#modal').close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').open) $('#modal').close(); });
/* sticky pill: hide on scroll-down */
let lastY = window.scrollY;
addEventListener('scroll', () => { const y = window.scrollY; if (Math.abs(y - lastY) > 4) { document.body.classList.toggle('scroll-down', y > lastY && y > 80); lastY = y; } }, { passive: true });

/* mode + limits */
async function health() {
  const h = await (await fetch('api/health')).json();
  const b = $('#modeBadge');
  b.textContent = h.mode === 'mock' ? 'Demo data' : 'Live agent';
  b.className = 'tag ' + h.mode;
  if (h.limits && h.mode === 'live') $('#limits').textContent = `${h.limits.perIpPerHour} per hour · ${Math.max(0, h.limits.globalPerDay - h.limits.usedToday)} of ${h.limits.globalPerDay} left today`;
}
async function loadRecent() {
  const [all, lb] = await Promise.all([fetch('api/recent').then((r) => r.json()), fetch('api/leaderboard').then((r) => r.json()).catch(() => null)]);
  const score = {}; ((lb && lb.brands) || []).forEach((b) => (score[b.slug] = b.score, score[gwBrand(b.brand).toLowerCase()] = b.score));
  // merge duplicates by display name (list is newest first; keep the first)
  const seen = new Set(), list = [];
  for (const r of all) { const name = gwBrand(r.brand), k = name.toLowerCase(); if (seen.has(k)) continue; seen.add(k); list.push({ ...r, brand: name, score: score[r.slug] ?? score[k] }); }
  const tone = (s) => (s == null ? '' : s >= 70 ? 'hi' : s >= 40 ? 'mid' : 'lo');
  $('#recent').innerHTML = list.length ? list.map((r) => `<button class="chip ${tone(r.score)}" data-slug="${esc(r.slug)}"${r.score != null ? ` title="Integrity score ${r.score}/100"` : ''}><i class="dot" aria-hidden="true"></i>${esc(r.brand)}<small>${r.score != null ? r.score : r.claims + ' claims'}</small></button>`).join('') : '<span class="sub">Nothing yet.</span>';
}
/* rotating suggestion placeholder */
(() => {
  const inp = $('#brand'), names = ['Unilever', 'IKEA', 'Volkswagen', 'Danone', 'Ryanair', 'Apple', 'Zara', 'TotalEnergies'];
  let i = 0; inp.placeholder = 'Try “' + names[0] + '”';
  if (!reduced) setInterval(() => { if (inp.value || document.activeElement === inp) return; i = (i + 1) % names.length; inp.classList.add('ph-out'); setTimeout(() => { inp.placeholder = 'Try “' + names[i] + '”'; inp.classList.remove('ph-out'); }, 220); }, 2600);
})();
$('#recent').addEventListener('click', async (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  const rec = await (await fetch('api/recent/' + b.dataset.slug)).json();
  $('#progress').className = 'progress hidden';
  showReport(rec.report, false, `Saved ${new Date(rec.saved_at).toLocaleDateString()}`);
  $('#report').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
});

/* search */
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const brand = $('#brand').value.trim(); if (!brand) return;
  const btn = e.target.querySelector('button'); btn.disabled = true;
  $('#report').innerHTML = ''; $('#steps').innerHTML = ''; $('#stepNow').textContent = 'Starting the agent…';
  $('#progress').className = 'progress'; document.body.classList.add('searching');
  try {
    const r = await fetch('api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand }) });
    const { jobId, error } = await r.json(); if (!jobId) throw new Error(error || 'Failed to start');
    for (;;) {
      await new Promise((res) => setTimeout(res, 1000));
      const j = await (await fetch('api/research/' + jobId)).json();
      $('#steps').innerHTML = j.progress.map((p) => `<li>${esc(prettyStep(p.s))}</li>`).join('');
      if (j.progress.length) $('#stepNow').textContent = prettyStep(j.progress[j.progress.length - 1].s);
      if (j.status === 'done') { $('#progress').classList.add('done', 'hidden'); showReport(j.report, j.mock, j.cached ? 'Cached result' : ''); loadRecent(); health(); break; }
      if (j.status === 'error') throw new Error(j.error);
    }
  } catch (err) {
    $('#progress').classList.add('hidden');
    $('#report').innerHTML = `<div class="err">${esc(err.message)}</div>`;
  } finally { btn.disabled = false; document.body.classList.remove('searching'); }
});

function showReport(r, mock, note) {
  window.dispatchEvent(new CustomEvent("gw:report", { detail: r }));
  const banner = mock || r.example_data ? `<div class="banner">Demo data. This is not a live run.</div>` : note ? `<div class="banner saved">${esc(note)}</div>` : '';
  const items = (r.claims || []).map((c, i) => `<article class="claim ${vClass(c.verdict)}" style="--i:${i}">
    <span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span><q>${esc(unq(c.claim))}</q>
    <p>${esc(c.reason)}</p>
    <ul><li><a href="${esc(safeUrl(c.source_url))}" target="_blank" rel="noopener">Brand source</a> ${esc(fmtDate(c.date))}</li>${(c.evidence || []).map((e) => `<li><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.title || e.url)}</a></li>`).join('')}</ul>
  </article>`).join('');
  $('#report').innerHTML = `${banner}<h3 style="font-size:1.8rem;margin:.4em 0 .2em">${esc(r.brand)}</h3><p class="sub">${esc(r.summary)}</p><div class="claims">${items}</div>${r.raw ? `<pre>${esc(r.raw)}</pre>` : ''}`;
}

loadCases(); health(); loadRecent();
