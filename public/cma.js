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
  function lane(agent) { return document.querySelector(`.cma-lane[data-agent="${agent}"] ol`) || document.querySelector('.cma-lane[data-agent="Judge"] ol'); }
  function add(e) {
    const li = document.createElement('li'); li.className = 'k-' + e.kind;
    const who = e.kind === 'handoff' ? `→ ${esc(e.to || 'subagent')}: ` : e.kind === 'report' ? `↩ report: ` : e.kind === 'steer' ? '🧭 ' : '';
    li.innerHTML = `${who}${e.tool ? `<b>${esc(e.tool)}</b> ` : ''}${esc(e.text)}`;
    const target = e.agent === 'You' || e.agent === 'Server' || e.agent === 'Mock' ? 'Judge' : e.agent;
    const ol = lane(target); ol.appendChild(li); ol.parentElement.scrollTop = 1e9;
    if (e.kind === 'grade' && e.result) $('#cma-outcome').textContent = `Outcome grader: ${e.result}`;
  }
  function start(id) {
    jobId = id; $('#cma-live').classList.remove('hidden'); $('#cma-debate').innerHTML = ''; $('#cma-outcome').textContent = '';
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
    if (!r || !(r.claims || []).some((c) => c.prosecution || c.defense)) return;
    $('#cma-debate').innerHTML = `<h3>The debate</h3>${r.changes_since_last ? `<p><b>Since last check:</b> ${esc(r.changes_since_last)}</p>` : ''}` + r.claims.map((c) =>
      `<div class="cma-claim"><q>${esc(c.claim)}</q> → <b>${esc(c.verdict)}</b><div class="cma-pd"><div class="p">⚖️ Prosecutor: ${esc(c.prosecution)}</div><div class="d">🛡️ Defender: ${esc(c.defense)}</div></div></div>`).join('');
  }
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
})();
