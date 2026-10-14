// Live CMA panel: SSE timeline per agent, steering, outcome, debate, under-the-hood. Independent of app.js.
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let jobId = null, es = null;
  // Observe app.js's POST api/research without touching app.js.
  const ofetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    const r = await ofetch(u, o);
    if (String(u).endsWith('api/research') && o && o.method === 'POST') r.clone().json().then((j) => j.jobId && !j.cached && start(j.jobId)).catch(() => {});
    return r;
  };
  // 4th lane: Compliance Consultant (injected so index.html stays untouched).
  function ensureLane() {
    const lanes = $('#cma-lanes'); if (!lanes || lanes.querySelector('[data-agent="Compliance Consultant"]')) return;
    const d = document.createElement('div'); d.className = 'cma-lane cma-lane-consultant'; d.dataset.agent = 'Compliance Consultant';
    d.innerHTML = '<h4>Consultant</h4><ol></ol>'; lanes.appendChild(d); lanes.classList.add('four');
  }
  document.addEventListener('DOMContentLoaded', ensureLane); ensureLane();
  function lane(agent) { if (/consult/i.test(agent || '')) agent = 'Compliance Consultant'; return document.querySelector(`.cma-lane[data-agent="${agent}"] ol`) || document.querySelector('.cma-lane[data-agent="Judge"] ol'); }
  function add(e) {
    const li = document.createElement('li'); li.className = 'k-' + e.kind;
    const who = e.kind === 'handoff' ? `→ ${esc(e.to || 'subagent')}: ` : e.kind === 'report' ? `↩ report: ` : e.kind === 'steer' ? '🧭 ' : '';
    li.innerHTML = `${who}${e.tool ? `<b>${esc(e.tool)}</b> ` : ''}${esc(e.text)}`;
    const target = e.agent === 'You' || e.agent === 'Server' || e.agent === 'Mock' ? 'Judge' : e.agent;
    const ol = lane(target); ol.appendChild(li); ol.parentElement.scrollTop = 1e9;
    if (e.kind === 'grade' && e.result) $('#cma-outcome').textContent = `Outcome grader: ${e.result}`;
  }
  function start(id) {
    ensureLane(); jobId = id; $('#cma-live').classList.remove('hidden'); $('#cma-debate').innerHTML = ''; $('#cma-outcome').textContent = '';
    document.querySelectorAll('.cma-lane ol').forEach((o) => (o.innerHTML = ''));
    document.querySelectorAll('#cma-steer button').forEach((b) => (b.disabled = false));
    if (es) es.close();
    es = new EventSource(`api/research/${id}/stream`);
    es.onmessage = (m) => add(JSON.parse(m.data));
    es.addEventListener('end', () => { es.close(); finish(); });
  }
  async function finish() {
    document.querySelectorAll('#cma-steer button').forEach((b) => (b.disabled = true));
    const j = await (await ofetch(`api/research/${jobId}`)).json();
    const o = j.outcome, s = j.stats;
    $('#cma-outcome').textContent = [o && `Outcome grader: ${o.result} after ${o.iterations} evaluation${o.iterations === 1 ? '' : 's'}`, s && `· $${s.cost_usd?.toFixed(2)} · ${Math.round(s.active_seconds || 0)}s active · ${s.threads || 0} subagent threads`].filter(Boolean).join(' ');
    debate(j.report);
    hood();
  }
  function debate(r) {
    if (!r || !(r.claims || []).some((c) => c.prosecution || c.defense || c.rewrite)) return;
    $('#cma-debate').innerHTML = `<h3>The debate</h3>${r.changes_since_last ? `<p><b>Since last check:</b> ${esc(r.changes_since_last)}</p>` : ''}` + r.claims.map((c) =>
      `<div class="cma-claim"><q>${esc(c.claim)}</q> → <b>${esc(c.verdict)}</b><div class="cma-pd"><div class="p">⚖️ Prosecutor: ${esc(c.prosecution)}</div><div class="d">🛡️ Defender: ${esc(c.defense)}</div></div>${ba(c)}</div>`).join('') + rewrites(r);
  }
  // Before/After: original claim struck through, then the Consultant's compliant rewrite.
  function ba(c) {
    if (!c.rewrite) return '';
    const ev = (c.evidence_needed || []).filter(Boolean);
    return `<div class="cma-ba"><div class="before"><span>Before</span><s>${esc(c.claim)}</s></div><div class="after"><span>After · Consultant rewrite</span><p>${esc(c.rewrite)}</p>${ev.length ? `<small>Evidence needed:</small><ul>${ev.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></div>`;
  }
  function rewrites() { return ''; }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('#cma-steer button'); if (!b || !jobId) return;
    b.disabled = true;
    const r = await ofetch(`api/research/${jobId}/steer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preset: b.dataset.preset }) });
    if (!r.ok) add({ agent: 'Judge', kind: 'sys', text: (await r.json()).error });
  });
  // Recent reports opened by app.js may carry debate fields.
  window.addEventListener('gw:report', (e) => debate(e.detail));
  async function hood() {
    let h; try { h = await (await ofetch('api/cma')).json(); } catch { return; }
    const node = (t, id, sub, pulse) => `<div class="hood-node${pulse ? ' pulse' : ''}"><h5>${t}</h5><code>${esc(id || '—')}</code><small>${sub || ''}</small></div>`;
    if (h.mode !== 'live') { $('#hood-diagram').innerHTML = node('Mock mode', '', 'No API key configured'); return; }
    const a = h.agents || {}, ag = (x) => x ? `${esc(x.name)} v${x.version} · ${esc(x.model || '')}` : '';
    const lr = h.last_run || {};
    $('#hood-diagram').innerHTML = [
      node('Agent · Judge (coordinator)', a.judge?.id, ag(a.judge) + ' · multiagent_20261001'),
      node('Subagent · Prosecutor', a.prosecutor?.id, ag(a.prosecutor)),
      node('Subagent · Defender', a.defender?.id, ag(a.defender)),
      node('Subagent · Compliance Consultant', a.consultant?.id, ag(a.consultant)),
      node('Environment', h.environment?.id, `networking: ${esc(h.environment?.networking || '')}`),
      node('Session', lr.session_id, lr.brand ? `last: ${esc(lr.brand)}` : 'none yet', !lr.finished),
      node('Events', 'SSE /events/stream', 'primary + one stream per subagent thread'),
      node('Outcome', h.outcome?.rubric, `max_iterations ${h.outcome?.max_iterations} · ${esc(lr.outcome?.result || '')}`),
      node('Memory store', h.memory?.id, `${(h.memory?.files || []).length} files · brands/&lt;slug&gt;.md`),
      node('Deployment', h.deployment?.id, `cron ${esc(h.deployment?.cron)} ${esc(h.deployment?.tz)} · next ${esc((h.deployment?.next || '').replace('T', ' ').slice(0, 16))} UTC`),
    ].join('');
    const s = lr.stats || {};
    $('#hood-stats').innerHTML = s.cost_usd != null ? [['Cost', '$' + s.cost_usd.toFixed(2)], ['Output tokens', s.output_tokens], ['Input tokens', s.input_tokens], ['Web searches', s.web_searches], ['Active', Math.round(s.active_seconds || 0) + 's'], ['Duration', Math.round(s.duration_seconds || 0) + 's']].map(([k, v]) => `<div><b>${esc(v ?? '—')}</b>${k}</div>`).join('') : '<div>No live run yet</div>';
  }
  document.addEventListener('DOMContentLoaded', hood);
  // ---------- Leaderboard ----------
  let lb = null, ind = 'All';
  function lbMount() {
    if ($('#leaderboard')) return;
    const sec = document.createElement('section'); sec.id = 'leaderboard'; sec.className = 'lb';
    sec.innerHTML = '<div class="lb-wrap"><p class="lb-kicker">Integrity leaderboard</p><h2>Who backs up their green claims?</h2><p class="lb-sub">Score 0–100 from the latest review: holds up = 1, unsubstantiated = 0.5, misleading = 0. Our assessment, not a legal finding.</p><div class="lb-filter" role="tablist"></div><ol class="lb-list"></ol></div>';
    const anchor = $('#hood') || $('#cases'); anchor ? anchor.parentNode.insertBefore(sec, anchor) : document.body.appendChild(sec);
    const nav = document.querySelector('header nav'); if (nav && !nav.querySelector('[href="#leaderboard"]')) { const a = document.createElement('a'); a.href = '#leaderboard'; a.textContent = 'Leaderboard'; nav.insertBefore(a, nav.lastElementChild); }
  }
  function lbRender() {
    const f = $('#leaderboard .lb-filter'), l = $('#leaderboard .lb-list'); if (!lb || !f) return;
    f.innerHTML = ['All', ...lb.industries].map((x) => `<button role="tab" aria-selected="${x === ind}" data-ind="${esc(x)}">${esc(x)}</button>`).join('');
    const rows = lb.brands.filter((b) => ind === 'All' || b.industry === ind);
    l.innerHTML = rows.length ? rows.map((b, i) => { const t = b.tally || {}, h = b.history || [], prev = h.length > 1 ? h[h.length - 2].score : null, d = prev == null ? '' : b.score - prev;
      const tone = b.score >= 70 ? 'hi' : b.score >= 40 ? 'mid' : 'lo';
      return `<li class="lb-row"><span class="lb-rank">${i + 1}</span><div class="lb-main"><div class="lb-top"><b>${esc(b.brand)}</b><em>${esc(b.industry)}</em><span class="lb-score">${b.score}</span></div><div class="lb-bar"><i class="${tone}" style="--w:${b.score}%;--d:${i * 70}ms"></i></div><small>${t['holds up'] || 0} hold up · ${t.unsubstantiated || 0} unsubstantiated · ${t.misleading || 0} misleading · checked ${esc(b.last_checked)}${h.length > 1 ? ` · ${h.length} runs (${h.map((x) => x.score).join(' → ')})${d ? ` <span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : ''}` : ''}</small></div></li>`; }).join('') : '<li class="lb-empty">No brands in this industry yet.</li>';
    requestAnimationFrame(() => requestAnimationFrame(() => l.querySelectorAll('.lb-bar i').forEach((x) => x.classList.add('go'))));
  }
  async function lbLoad() { lbMount(); try { lb = await (await ofetch('api/leaderboard')).json(); lbRender(); } catch {} }
  document.addEventListener('click', (e) => { const b = e.target.closest('#leaderboard .lb-filter button'); if (b) { ind = b.dataset.ind; lbRender(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lbLoad); else lbLoad();
})();
