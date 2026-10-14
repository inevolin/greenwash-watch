// Courtroom: live transcript from SSE + replay of a finished/cached report. Independent of app.js/cma.js.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));
  const vCls = (v) => (/hold/i.test(v) ? 'ok' : /unsub|commit/i.test(v) ? 'uns' : 'mis');
  const unq = (s) => String(s ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  const WHO = {
    Prosecutor: { i: 'P', side: 'l', name: 'Prosecutor' },
    Defender: { i: 'D', side: 'r', name: 'Defender' },
    Judge: { i: 'J', side: 'c', name: 'Judge' },
    'Compliance Consultant': { i: 'C', side: 'c', name: 'Consultant' },
  };
  let run = 0; // cancels an in-flight replay
  window.__court = { report: null };

  function mount() {
    let c = $('#court'); if (c) return c;
    c = document.createElement('section'); c.id = 'court'; c.className = 'court hidden'; c.setAttribute('aria-live', 'polite');
    c.innerHTML = `<header class="ct-head"><div><span class="ct-kicker">In session</span><h3 class="ct-title">The courtroom</h3></div>
      <div class="ct-actions"><button type="button" class="ct-btn ct-replay" hidden>↻ Replay</button></div></header>
      <div class="ct-live"></div><div class="ct-body"></div>`;
    const rep = $('#report'); rep.parentNode.insertBefore(c, rep.nextSibling);
    c.querySelector('.ct-replay').onclick = () => window.__court.report && play(window.__court.report);
    return c;
  }
  function avatar(w) { return `<span class="ct-av ct-av-${w.i}" aria-hidden="true">${w.i}</span>`; }
  async function typeInto(el, text) {
    if (RM) { el.textContent = text; return; }
    const words = String(text).split(/(\s+)/); const step = Math.max(8, Math.min(28, 1400 / words.length));
    for (let k = 0; k < words.length; k++) { el.textContent += words[k]; if (k % 2 === 0) await new Promise((r) => setTimeout(r, step)); }
  }
  async function bubble(host, agent, text, token) {
    const w = WHO[agent] || WHO.Judge;
    const b = document.createElement('div'); b.className = `ct-msg ct-${w.side} ct-who-${w.i}`;
    b.innerHTML = `${avatar(w)}<div class="ct-bub"><span class="ct-name">${w.name}</span><p><span class="ct-typing"><i></i><i></i><i></i></span></p></div>`;
    host.appendChild(b); requestAnimationFrame(() => b.classList.add('in'));
    await sleep(450); if (token !== run) return;
    const p = b.querySelector('p'); p.textContent = ''; await typeInto(p, text);
  }
  async function stamp(host, verdict, reason) {
    const s = document.createElement('div'); s.className = `ct-ruling ${vCls(verdict)}`;
    s.innerHTML = `<span class="ct-av ct-av-J" aria-hidden="true">J</span><div><span class="ct-name">Judge · ruling</span><span class="ct-stamp">${esc(verdict)}</span>${reason ? `<p>${esc(reason)}</p>` : ''}</div>`;
    host.appendChild(s); await sleep(30); s.classList.add('in'); await sleep(650);
  }
  function rewriteCard(c) {
    const ev = (c.evidence_needed || []).filter(Boolean);
    return `<div class="ct-rewrite"><span class="ct-av ct-av-C" aria-hidden="true">C</span><div class="ct-rw-body"><span class="ct-name">Consultant · compliant rewrite</span>
      <div class="ba" data-ba><div class="ba-pane ba-after"><span>After</span><p>${esc(c.rewrite)}</p></div>
      <div class="ba-pane ba-before"><span>Before</span><p><s>${esc(unq(c.claim))}</s></p></div>
      <div class="ba-hint">Drag or tap to compare</div><div class="ba-handle" role="slider" tabindex="0" aria-label="Compare original and rewrite" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><i></i></div></div>
      ${ev.length ? `<details class="ct-ev"><summary>Evidence needed (${ev.length})</summary><ul>${ev.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</div></div>`;
  }
  async function play(r) {
    const token = ++run, c = mount(); c.classList.remove('hidden', 'live'); document.body.classList.add('has-court');
    c.querySelector('.ct-kicker').textContent = 'Hearing replay';
    c.querySelector('.ct-live').innerHTML = '';
    const body = c.querySelector('.ct-body'); body.innerHTML = '';
    c.querySelector('.ct-replay').hidden = true;
    if (r.changes_since_last) body.insertAdjacentHTML('beforeend', `<p class="ct-since"><b>Since last check</b> ${esc(r.changes_since_last)}</p>`);
    const claims = (r.claims || []);
    for (let i = 0; i < claims.length; i++) {
      if (token !== run) return;
      const cl = claims[i];
      const art = document.createElement('article'); art.className = 'ct-claim';
      art.innerHTML = `<div class="ct-exhibit"><span>Exhibit ${String.fromCharCode(65 + i)}</span><q>${esc(unq(cl.claim))}</q></div><div class="ct-thread"></div>`;
      body.appendChild(art); requestAnimationFrame(() => art.classList.add('in'));
      const t = art.querySelector('.ct-thread');
      if (cl.prosecution) { await bubble(t, 'Prosecutor', cl.prosecution, token); await sleep(250); }
      if (token !== run) return;
      if (cl.defense) { await bubble(t, 'Defender', cl.defense, token); await sleep(250); }
      if (token !== run) return;
      await stamp(t, cl.verdict, cl.prosecution || cl.defense ? '' : cl.reason);
      if (token !== run) return;
      if (cl.rewrite) { t.insertAdjacentHTML('beforeend', rewriteCard(cl)); const rw = t.lastElementChild; await sleep(30); rw.classList.add('in'); initBA(rw); await sleep(500); }
    }
    if (token === run) { c.querySelector('.ct-replay').hidden = false; c.querySelector('.ct-kicker').textContent = 'Hearing closed'; }
  }
  // ---- before/after slider ----
  function initBA(root) {
    root.querySelectorAll('[data-ba]').forEach((ba) => {
      if (ba.dataset.ready) return; ba.dataset.ready = 1;
      const h = ba.querySelector('.ba-handle');
      const set = (pct) => { pct = Math.max(0, Math.min(100, pct)); ba.style.setProperty('--x', pct + '%'); h.setAttribute('aria-valuenow', Math.round(pct)); };
      const fromEv = (e) => { const r = ba.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
      let drag = false, moved = 0, x0 = 0;
      ba.addEventListener('pointerdown', (e) => { drag = true; moved = 0; x0 = e.clientX; ba.setPointerCapture(e.pointerId); set(fromEv(e)); ba.classList.add('drag'); });
      ba.addEventListener('pointermove', (e) => { if (drag) { moved = Math.max(moved, Math.abs(e.clientX - x0)); set(fromEv(e)); } });
      const end = () => { drag = false; ba.classList.remove('drag'); ba.classList.add('used'); };
      ba.addEventListener('pointerup', end); ba.addEventListener('pointercancel', end);
      h.addEventListener('keydown', (e) => { const v = +h.getAttribute('aria-valuenow'); if (e.key === 'ArrowLeft') set(v - 10); if (e.key === 'ArrowRight') set(v + 10); });
      // open on the original, then wipe across to the rewrite (ends fully on "After")
      ba.addEventListener('click', (e) => { if (moved > 6) return; const v = +h.getAttribute('aria-valuenow'); ba.classList.add('snap'); set(v > 50 ? 0 : 100); setTimeout(() => ba.classList.remove('snap'), 450); });
      set(100);
      if (RM) set(0); else {
        let t0; const ease = (x) => 1 - Math.pow(1 - x, 3);
        const sweep = (t) => { if (drag) return; t0 = t0 || t; const p = Math.min(1, (t - t0) / 1400); set(100 - 100 * ease(p)); if (p < 1) requestAnimationFrame(sweep); };
        setTimeout(() => requestAnimationFrame(sweep), 900);
      }
    });
  }
  window.__court.initBA = initBA;
  // ---- live: observe the SSE stream cma.js opens ----
  const OES = window.EventSource;
  window.EventSource = function (url, opts) {
    const es = new OES(url, opts);
    if (/api\/research\/[^/]+\/stream/.test(String(url))) startLive(es);
    return es;
  };
  window.EventSource.prototype = OES.prototype;
  function startLive(es) {
    const token = ++run, c = mount(); c.classList.remove('hidden'); c.classList.add('live'); document.body.classList.add('has-court');
    c.querySelector('.ct-kicker').textContent = 'In session · live';
    c.querySelector('.ct-body').innerHTML = ''; c.querySelector('.ct-replay').hidden = true;
    const live = c.querySelector('.ct-live'); live.innerHTML = '<div class="ct-thread"></div>';
    const t = live.firstChild; let lastTool = null;
    es.addEventListener('message', (m) => {
      if (token !== run) return; let e; try { e = JSON.parse(m.data); } catch { return; }
      const agent = /consult/i.test(e.agent || '') ? 'Compliance Consultant' : e.agent;
      if (!WHO[agent] || e.kind === 'sys' || e.kind === 'steer') return;
      if (e.tool || e.kind === 'tool') { // collapse tool calls into one evidence line per agent
        const txt = `${e.tool || ''} ${String(e.text || '').replace(/https?:\/\/(www\.)?/g, '')}`.trim().slice(0, 90);
        if (lastTool && lastTool.dataset.a === agent) { lastTool.querySelector('em').textContent = txt; lastTool.querySelector('b').textContent = +lastTool.querySelector('b').textContent + 1; return; }
        lastTool = document.createElement('div'); lastTool.className = `ct-tool ct-${WHO[agent].side}`; lastTool.dataset.a = agent;
        lastTool.innerHTML = `<span class="ct-dot ct-av-${WHO[agent].i}"></span><span>${WHO[agent].name} · <b>1</b> source</span><em>${esc(txt)}</em>`;
        t.appendChild(lastTool); trim(t); return;
      }
      lastTool = null;
      const text = String(e.text || '').replace(/\s+/g, ' ').trim(); if (!text || /^thinking/i.test(text)) return;
      if (e.kind === 'handoff') { t.insertAdjacentHTML('beforeend', `<div class="ct-note">Judge calls the ${esc((WHO[/consult/i.test(e.to) ? 'Compliance Consultant' : e.to] || {}).name || e.to || 'next agent')}</div>`); trim(t); return; }
      bubble(t, agent, text.length > 260 ? text.slice(0, 257) + '…' : text, token); trim(t);
    });
  }
  function trim(t) { while (t.children.length > 14) t.removeChild(t.firstChild); }
  // ---- finished / cached report → replay ----
  window.addEventListener('gw:report', (e) => {
    const r = e.detail; if (!r || !(r.claims || []).length) return;
    window.__court.report = r;
    if (!(r.claims || []).some((c) => c.prosecution || c.defense || c.rewrite)) { const c = $('#court'); if (c) c.classList.add('hidden'); document.body.classList.remove('has-court'); return; }
    play(r);
  });
})();
