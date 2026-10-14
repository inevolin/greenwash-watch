const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const vClass = (v) => (/hold/i.test(v) ? 'ok' : /unsub|commit/i.test(v) ? 'uns' : 'mis');
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
  $('#grid').innerHTML = cases.filter((c) => ind === 'All' || c.industry === ind).map((c, i) => `
    <button class="card" data-id="${esc(c.id)}" style="--i:${i}" aria-label="${esc(c.brand)}: ${esc(c.verdict)}">
      <div class="inner">
        <div class="face front"><span class="ind">${esc(c.industry)}</span><h3>${esc(c.brand)}</h3><q>${esc(c.claim)}</q><span class="hint">Tap to reveal the verdict</span></div>
        <div class="face back ${vClass(c.verdict)}"><span class="verdict">${esc(c.verdict)}</span><small>${esc(c.regulator)} · ${esc(c.date)}</small><span class="more">Details →</span></div>
      </div>
    </button>`).join('');
}
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  // touch: first tap flips, second opens
  if (matchMedia('(hover: none)').matches && !card.classList.contains('flip')) { card.classList.add('flip'); return; }
  const c = cases.find((x) => x.id === card.dataset.id);
  $('#modalBody').innerHTML = `<span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span><h2 style="font-size:2rem;margin-top:.4em">${esc(c.brand)}</h2>
    <dl><dt>Claim</dt><dd><q>${esc(c.claim)}</q></dd><dt>Why</dt><dd>${esc(c.reason)}</dd>
    <dt>Body</dt><dd>${esc(c.regulator)} · ${esc(c.date)}</dd>
    <dt>Source</dt><dd><a href="${esc(safeUrl(c.source))}" target="_blank" rel="noopener">${esc(new URL(c.source).hostname)} ↗</a></dd></dl>`;
  $('#modal').showModal();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.classList.contains('x')) $('#modal').close(); });

/* mode + limits */
async function health() {
  const h = await (await fetch('api/health')).json();
  const b = $('#modeBadge');
  b.textContent = h.mode === 'mock' ? 'Demo data' : 'Live agent';
  b.className = 'tag ' + h.mode;
  if (h.limits && h.mode === 'live') $('#limits').textContent = `${h.limits.perIpPerHour} searches/hour · ${Math.max(0, h.limits.globalPerDay - h.limits.usedToday)} left today`;
}
async function loadRecent() {
  const all = await (await fetch('api/recent')).json();
  // merge duplicates by display name, e.g. "Shell (Shell plc)" and "Shell" (list is newest first; keep the first)
  const seen = new Set(), list = [];
  for (const r of all) { const k = String(r.brand || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase(); if (seen.has(k)) continue; seen.add(k); list.push({ ...r, brand: String(r.brand || '').replace(/\s*\(.*?\)\s*/g, ' ').trim() }); }
  $('#recent').innerHTML = list.length ? list.map((r) => `<button class="chip" data-slug="${esc(r.slug)}">${esc(r.brand)} <small>${r.claims} claims</small></button>`).join('') : '<span class="sub">Nothing yet.</span>';
}
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
  $('#progress').className = 'progress';
  try {
    const r = await fetch('api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand }) });
    const { jobId, error } = await r.json(); if (!jobId) throw new Error(error || 'Failed to start');
    for (;;) {
      await new Promise((res) => setTimeout(res, 1000));
      const j = await (await fetch('api/research/' + jobId)).json();
      $('#steps').innerHTML = j.progress.map((p) => `<li>${esc(p.s)}</li>`).join('');
      if (j.progress.length) $('#stepNow').textContent = j.progress[j.progress.length - 1].s;
      if (j.status === 'done') { $('#progress').classList.add('done', 'hidden'); showReport(j.report, j.mock, j.cached ? 'Cached result' : ''); loadRecent(); health(); break; }
      if (j.status === 'error') throw new Error(j.error);
    }
  } catch (err) {
    $('#progress').classList.add('hidden');
    $('#report').innerHTML = `<div class="err">${esc(err.message)}</div>`;
  } finally { btn.disabled = false; }
});

function showReport(r, mock, note) {
  window.dispatchEvent(new CustomEvent("gw:report", { detail: r }));
  const banner = mock || r.example_data ? `<div class="banner">Demo data. This is not a live run.</div>` : note ? `<div class="banner saved">${esc(note)}</div>` : '';
  const items = (r.claims || []).map((c, i) => `<article class="claim ${vClass(c.verdict)}" style="--i:${i}">
    <span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span><q>${esc(c.claim)}</q>
    <p>${esc(c.reason)}</p>
    <ul><li><a href="${esc(safeUrl(c.source_url))}" target="_blank" rel="noopener">Brand source</a> ${esc(c.date || '')}</li>${(c.evidence || []).map((e) => `<li><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.title || e.url)}</a></li>`).join('')}</ul>
  </article>`).join('');
  $('#report').innerHTML = `${banner}<h3 style="font-size:1.8rem;margin:.4em 0 .2em">${esc(r.brand)}</h3><p class="sub">${esc(r.summary)}</p><div class="claims">${items}</div>${r.raw ? `<pre>${esc(r.raw)}</pre>` : ''}`;
}

loadCases(); health(); loadRecent();
