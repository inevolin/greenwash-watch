const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const vClass = (v) => (/hold/i.test(v) ? 'ok' : /unsub|commit/i.test(v) ? 'uns' : 'mis');

let cases = [];
async function loadCases() {
  cases = await (await fetch('/api/cases')).json();
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
  $('#grid').innerHTML = cases.filter((c) => ind === 'All' || c.industry === ind).map((c) => `
    <button class="card" data-id="${esc(c.id)}">
      <div class="top"><h3>${esc(c.brand)}</h3><span class="ind">${esc(c.industry)}</span></div>
      <q>${esc(c.claim)}</q>
      <span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span>
      <div class="meta">${esc(c.regulator)} · ${esc(c.date)}</div>
    </button>`).join('');
}
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const c = cases.find((x) => x.id === card.dataset.id);
  $('#modalBody').innerHTML = `<span class="ind">${esc(c.industry)}</span><h2>${esc(c.brand)}</h2>
    <dl><dt>Claim</dt><dd><q>${esc(c.claim)}</q></dd>
    <dt>Outcome</dt><dd><span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span></dd>
    <dt>Decided by</dt><dd>${esc(c.regulator)}</dd><dt>Date</dt><dd>${esc(c.date)}</dd>
    <dt>Why</dt><dd>${esc(c.reason)}</dd>
    <dt>Source</dt><dd><a href="${esc(safeUrl(c.source))}" target="_blank" rel="noopener">${esc(new URL(c.source).hostname)} ↗</a></dd></dl>`;
  $('#modal').showModal();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.close(); });

async function health() {
  const h = await (await fetch('/api/health')).json();
  const b = $('#modeBadge');
  b.textContent = h.mode === 'mock' ? 'Mock mode: example data' : 'Live: Claude Managed Agents';
  b.className = 'tag ' + h.mode;
  if (h.limits && h.mode === 'live') $('#limits').textContent = `Previously researched brands open instantly from the cache. New live searches are limited to ${h.limits.perIpPerHour} per visitor per hour and ${h.limits.globalPerDay} per day in total (${h.limits.usedToday} used today).`;
}
async function loadRecent() {
  const list = await (await fetch('/api/recent')).json();
  $('#recent').innerHTML = list.length ? list.map((r) => `<button class="chip" data-slug="${esc(r.slug)}">${esc(r.brand)} <small>${r.claims} claims · ${new Date(r.saved_at).toLocaleDateString()}</small></button>`).join('') : '<p class="sub">No saved reports yet.</p>';
}
$('#recent').addEventListener('click', async (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  const rec = await (await fetch('/api/recent/' + b.dataset.slug)).json();
  $('#progress').className = 'progress hidden';
  showReport(rec.report, false);
  $('#report').insertAdjacentHTML('afterbegin', `<div class="banner" style="background:#163326;color:var(--acc)">Saved report from ${esc(new Date(rec.saved_at).toLocaleString())}</div>`);
  $('#report').scrollIntoView({ behavior: 'smooth' });
});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const brand = $('#brand').value.trim(); if (!brand) return;
  const btn = e.target.querySelector('button'); btn.disabled = true;
  $('#report').innerHTML = ''; $('#steps').innerHTML = '';
  $('#progress').className = 'progress';
  try {
    const r = await fetch('/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand }) });
    const { jobId, error } = await r.json(); if (!jobId) throw new Error(error || 'failed to start');
    for (;;) {
      await new Promise((res) => setTimeout(res, 1000));
      const j = await (await fetch('/api/research/' + jobId)).json();
      $('#steps').innerHTML = j.progress.map((p) => `<li>${esc(p.s)}</li>`).join('');
      if (j.status === 'done') { $('#progress').classList.add('done'); showReport(j.report, j.mock); loadRecent(); break; }
      if (j.status === 'error') throw new Error(j.error);
    }
  } catch (err) {
    $('#progress').classList.add('done');
    $('#report').innerHTML = `<div class="err">Error: ${esc(err.message)}</div>`;
  } finally { btn.disabled = false; }
});

function showReport(r, mock) {
  const banner = mock || r.example_data ? `<div class="banner">⚠ EXAMPLE DATA. This is canned output from mock mode${r.requested_brand ? ` (you asked about "${esc(r.requested_brand)}")` : ''}, not a live research run.</div>` : '';
  const rows = (r.claims || []).map((c) => `<tr>
    <td><q>${esc(c.claim)}</q><br><a href="${esc(safeUrl(c.source_url))}" target="_blank" rel="noopener">source ↗</a> <small>${esc(c.date)}</small></td>
    <td><span class="v ${vClass(c.verdict)}">${esc(c.verdict)}</span></td>
    <td>${esc(c.reason)}<br><small style="color:var(--mut)">${esc(c.rule)}</small></td>
    <td><ul>${(c.evidence || []).map((e) => `<li><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.title || e.url)}</a></li>`).join('')}</ul></td></tr>`).join('');
  $('#report').innerHTML = `${banner}<h3>${esc(r.brand)}</h3><p class="sub">${esc(r.summary)}</p>
    ${rows ? `<table><thead><tr><th>Claim (brand's words)</th><th>Verdict</th><th>Our assessment</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    ${r.raw ? `<pre>${esc(r.raw)}</pre>` : ''}`;
}

loadCases(); health(); loadRecent();
