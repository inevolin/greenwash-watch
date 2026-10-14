// Greenwash Watch: zero-dependency Node server (Node >= 18, uses built-in fetch).
// Endpoints:
//   GET  /api/health          -> mode + config status
//   GET  /api/cases           -> verified case gallery data
//   POST /api/research {brand}-> starts a job, returns {jobId}
//   GET  /api/research/:id    -> {status, progress[], report?, error?}
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- tiny .env loader (no dependency) ---
for (const envPath of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { ANTHROPIC_API_KEY, AGENT_ID, ENVIRONMENT_ID } = process.env;
const PORT = Number(process.env.PORT || 3000);
const MOCK = process.env.MOCK === '1' || !ANTHROPIC_API_KEY || !AGENT_ID || !ENVIRONMENT_ID;

// --- CMA API (verified against platform.claude.com/docs/en/managed-agents/{sessions,events-and-streaming}) ---
const API = 'https://api.anthropic.com/v1';
const HEADERS = {
  'x-api-key': ANTHROPIC_API_KEY || '',
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'content-type': 'application/json',
};
async function cma(method, p, body) {
  const res = await fetch(API + p, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`CMA ${method} ${p} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const PROMPT = (brand) => `Research the brand "${brand}" as the Greenwash Watch agent.
Find its recent environmental / sustainability marketing claims (use relative dates: roughly the last 12 months), and any regulator or court rulings about them.
For each claim: quote the brand's own words exactly, give the source URL and date, and find at least one independent source that supports or contradicts it.
Verdict scale: "holds up" | "unsubstantiated" | "misleading". Use "unsubstantiated" when evidence is insufficient.
Use defamation-safe wording ("our assessment"); never allege intent unless quoting a ruling. Reference the UK CMA Green Claims Code and EU Directive 2024/825 where relevant. The EU Green Claims Directive is only a pending proposal; do not cite it as law.
End your final message with ONLY a fenced \`\`\`json block of this shape:
{"brand":"","summary":"","claims":[{"claim":"","source_url":"","date":"","verdict":"holds up|unsubstantiated|misleading","reason":"","rule":"","evidence":[{"title":"","url":""}]}]}${process.env.JUDGE_ID ? `\nYou are the Judge: delegate to Prosecutor, then Defender, then Compliance Consultant for every unsubstantiated/misleading claim, as your system prompt says. For those claims add "rewrite" (compliant wording under the UK CMA Green Claims Code and EU 2024/825) and "evidence_needed" (array of strings). Add "prosecution" and "defense" (one sentence each) to every claim, and a top-level "changes_since_last" from your brand memory file. Keep total cost low.` : ''}`;

const jobs = new Map();

// --- rate limiting, cache, persistence ---
const PER_IP_PER_HOUR = Number(process.env.RATE_PER_IP_PER_HOUR || 2);
const GLOBAL_PER_DAY = Number(process.env.RATE_GLOBAL_PER_DAY || 20);
const CACHE_HOURS = Number(process.env.CACHE_HOURS || 24 * 7);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const ipHits = new Map(); // ip -> [timestamps]
let dayKey = '', dayCount = 0;
const norm = (b) => b.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'brand';
function cached(brand) {
  const f = path.join(DATA_DIR, norm(brand) + '.json');
  if (!fs.existsSync(f)) return null;
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Date.now() - r.saved_at < CACHE_HOURS * 3600e3 ? r : null;
}
function persist(brand, report, sessionId, source) {
  const rec = { brand, saved_at: Date.now(), session_id: sessionId || null, source: source || 'visitor', report };
  fs.writeFileSync(path.join(DATA_DIR, norm(brand) + '.json'), JSON.stringify(rec));
}
function recent() {
  return fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => {
    try { const r = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); return { brand: r.brand, slug: f.slice(0, -5), saved_at: r.saved_at, claims: (r.report.claims || []).length, source: r.source || 'visitor' }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.saved_at - a.saved_at).slice(0, 30);
}

// Leaderboard: 0-100 integrity score per brand from saved reports (holds up=1, unsubstantiated=0.5, misleading=0).
const INDUSTRY = (() => { const m = {}; try { for (const l of fs.readFileSync(path.join(__dirname, 'docs', 'brands.md'), 'utf8').split('\n')) { const c = l.split('|').map((x) => x.trim()); if (c.length > 3 && c[1] && c[1] !== 'Industry' && !/^-+$/.test(c[1])) for (const b of c[2].split(/,(?![^(]*\))/)) { const n = norm(b.replace(/\(.*\)/, '')); if (n) m[n] = c[1]; } } } catch {} return m; })();
function industryOf(brand) { const n = norm(String(brand || '').replace(/\(.*\)/, '')); if (INDUSTRY[n]) return INDUSTRY[n]; const k = Object.keys(INDUSTRY).find((x) => n.startsWith(x + '-') || n.split('-')[0] === x.split('-')[0]); return k ? INDUSTRY[k] : 'Other'; }
const PTS = { 'holds up': 1, unsubstantiated: 0.5, misleading: 0 };
function leaderboard() {
  const by = {};
  for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { continue; }
    const cl = (r.report?.claims || []).filter((c) => String(c.verdict || '').toLowerCase() in PTS); if (!cl.length) continue;
    const name = String(r.report?.brand || r.brand || f).replace(/\s*\(.*\)\s*/, '').trim(), key = norm(name);
    const tally = { 'holds up': 0, unsubstantiated: 0, misleading: 0 }; let pts = 0;
    for (const c of cl) { const v = String(c.verdict).toLowerCase(); tally[v]++; pts += PTS[v]; }
    const run = { date: new Date(r.saved_at).toISOString().slice(0, 10), saved_at: r.saved_at, score: Math.round((100 * pts) / cl.length), claims: cl.length, tally, slug: f.slice(0, -5), source: r.source || 'visitor' };
    (by[key] = by[key] || { brand: name, industry: industryOf(name), history: [] }).history.push(run);
  }
  const rows = Object.values(by).map((b) => { b.history.sort((x, y) => x.saved_at - y.saved_at); const last = b.history[b.history.length - 1]; return { ...b, score: last.score, claims: last.claims, tally: last.tally, last_checked: last.date, slug: last.slug }; })
    .sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand)).map((b, i) => ({ rank: i + 1, ...b }));
  return { scoring: { 'holds up': 1, unsubstantiated: 0.5, misleading: 0, scale: '0-100, latest run per brand' }, industries: [...new Set(rows.map((r) => r.industry))].sort(), brands: rows };
}
function checkLimits(ip) {
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 3600e3);
  ipHits.set(ip, hits);
  if (hits.length >= PER_IP_PER_HOUR) return `Rate limit: ${PER_IP_PER_HOUR} live searches per hour per visitor. Try a brand from "Recent research" meanwhile.`;
  if (dayCount >= GLOBAL_PER_DAY) return `Daily cap of ${GLOBAL_PER_DAY} live searches reached. Cached reports are still available.`;
  hits.push(now); dayCount++; return null;
}

function extractReport(text, brand) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const b of blocks.reverse()) {
    try { const j = JSON.parse(b[1]); if (j && Array.isArray(j.claims)) return j; } catch {}
  }
  return { brand, summary: 'The agent did not return structured JSON. Raw output is below.', claims: [], raw: text };
}

// ---------- Live CMA run: SSE streams (primary + every subagent thread), steering, outcomes, memory ----------
const { JUDGE_ID, MEMORY_STORE_ID, DEPLOYMENT_ID, PROSECUTOR_ID, DEFENDER_ID } = process.env;
const CONSULTANT_ID = process.env.CONSULTANT_ID || 'agent_01KhD4P8s8VY5CtxAzcMxGip';
const RUN_AGENT = JUDGE_ID || AGENT_ID; // multi-agent Judge when configured, else single agent
const label = (ev) => {
  const i = ev.input || {};
  switch (ev.type) {
    case 'agent.tool_use': return { kind: 'tool', tool: ev.name, text: i.query || i.url || i.path || i.file_path || i.command || '' };
    case 'agent.tool_result': return null;
    case 'agent.message': { const t = (ev.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'); return { kind: 'msg', text: t.replace(/```json[\s\S]*?```/g, '[JSON report]').slice(0, 600) }; }
    case 'agent.thinking': return { kind: 'think', text: 'thinking…' };
    case 'session.thread_created': return { kind: 'thread', text: `${ev.agent_name || 'subagent'} joined` };
    case 'agent.thread_message_sent': return { kind: 'handoff', to: ev.agent_name || ev.to_agent_name, text: textOf(ev).slice(0, 400) };
    case 'agent.thread_message_received': return { kind: 'report', from: ev.from_agent_name, text: textOf(ev).slice(0, 900) };
    case 'span.outcome_evaluation_start': return { kind: 'grade', text: 'Grader checking the report against the rubric…' };
    case 'span.outcome_evaluation_end': return { kind: 'grade', result: ev.result, text: `Grader: ${ev.result}${ev.explanation ? ' · ' + String(ev.explanation).slice(0, 300) : ''}` };
    case 'user.message': return { kind: 'steer', text: textOf(ev).slice(0, 200) };
    case 'session.usage': return null;
    default: return null;
  }
};
function textOf(ev) { const c = ev.content || ev.message || []; return Array.isArray(c) ? c.map((x) => x.text || '').join(' ') : String(c.text || c || ''); }

async function sse(p, onEvent, signal) {
  const res = await fetch(API + p, { headers: { ...HEADERS, accept: 'text/event-stream' }, signal });
  if (!res.ok) throw new Error(`stream ${p} -> ${res.status}`);
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) return;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) { try { onEvent(JSON.parse(line.slice(5))); } catch {} }
    }
  }
}

function pushEv(job, e) {
  e.t = Date.now(); e.i = job.events.length; job.events.push(e);
  if (e.text) job.progress.push({ t: e.t, s: `${e.agent}: ${e.tool ? e.tool + ' ' : ''}${e.text}`.slice(0, 200) });
  for (const c of job.clients) c.write(`data: ${JSON.stringify(e)}\n\n`);
}

async function watch(job, sessionId) {
  const ac = new AbortController(); job.abort = ac;
  const texts = [], threads = new Set(), names = {};
  let resolveIdle; const idle = new Promise((r) => (resolveIdle = r));
  const handle = (agent) => (ev) => {
    if (ev.type === 'session.usage' && ev.usage) job.stats = { ...(job.stats || {}), live_cost_cents: Number((ev.usage.list_cost || {}).amount || 0) };
    if (agent === 'Judge' && ev.type === 'agent.message') texts.push(textOf(ev));
    if (ev.type === 'span.outcome_evaluation_end') job.outcome = { result: ev.result, iterations: (job.outcome?.iterations || 0) + 1, explanation: ev.explanation || '' };
    if (ev.type === 'session.thread_created' && ev.session_thread_id && !threads.has(ev.session_thread_id)) {
      threads.add(ev.session_thread_id); names[ev.session_thread_id] = ev.agent_name;
      sse(`/sessions/${sessionId}/threads/${ev.session_thread_id}/stream?beta=true`, handle(ev.agent_name || 'subagent'), ac.signal).catch(() => {});
    }
    if (agent === 'Judge' && (ev.type === 'session.status_idle' || ev.type === 'session.status_terminated' || ev.type === 'session.error')) resolveIdle(ev);
    if (agent !== 'Judge' && ev.type === 'agent.thread_message_received') return; // its prompt; already shown as the handoff
    const l = label(ev); if (l && l.kind === 'handoff') l.to = l.to || names[ev.to_session_thread_id];
    if (l && l.kind === 'report') l.from = l.from || names[ev.from_session_thread_id];
    if (l) pushEv(job, { agent: l.from && ev.type === 'agent.thread_message_received' ? l.from : agent, ...l });
  };
  const primary = sse(`/sessions/${sessionId}/events/stream?beta=true`, handle('Judge'), ac.signal).catch((e) => { if (!ac.signal.aborted) resolveIdle({ type: 'stream_closed', err: e.message }); });
  primary.then(() => resolveIdle({ type: 'stream_closed' }));
  const timer = setTimeout(() => resolveIdle({ type: 'timeout' }), 20 * 60e3);
  const deferred = [];
  for (;;) {
    const ev = await Promise.race([idle, new Promise((r) => setTimeout(() => r(null), 15000))]);
    // safety net: confirm with the session object (stream may close early)
    const s = await cma('GET', `/sessions/${sessionId}`).catch(() => null);
    if (s && s.status === 'idle' && ev) {
      const why = ev.stop_reason && ev.stop_reason.type;
      clearTimeout(timer); ac.abort();
      job.stats = { cost_usd: Number(s.usage?.list_cost?.amount || 0) / 100, input_tokens: (s.usage?.input_tokens || 0) + (s.usage?.cache_read_input_tokens || 0) + (s.usage?.cache_creation?.ephemeral_5m_input_tokens || 0), output_tokens: s.usage?.output_tokens || 0, web_searches: s.usage?.server_tool_use?.web_search_requests || 0, web_fetches: s.usage?.server_tool_use?.web_fetch_requests || 0, active_seconds: s.stats?.active_seconds, duration_seconds: s.stats?.duration_seconds, threads: threads.size };
      const oe = s.outcome_evaluations || []; if (oe.length) job.outcome = { ...(job.outcome || {}), result: oe[oe.length - 1].result, iterations: Math.max(job.outcome?.iterations || 0, oe.length) };
      if (why === 'budget_reached') throw new Error('Session budget reached ($' + (Number(process.env.BUDGET_CENTS || 400) / 100) + ' cap)');
      if (why === 'requires_action') throw new Error('Session needs a tool confirmation (requires_action)');
      let all = texts.join('\n');
      if (!/```json/.test(all)) { const page = await cma('GET', `/sessions/${sessionId}/events?beta=true&limit=1000`).catch(() => ({ data: [] })); all = (page.data || []).filter((e) => e.type === 'agent.message' && !e.session_thread_id).map(textOf).join('\n'); }
      return extractReport(all, job.brand);
    }
    if (s && (s.status === 'terminated')) { ac.abort(); throw new Error('Session terminated'); }
    if (ev && ev.type === 'timeout') { ac.abort(); throw new Error('Timed out after 20 minutes'); }
    if (ev && ev.type === 'stream_closed') { // reopen primary stream if it dropped while running
      return watchRest(job, sessionId, texts, threads, ac, timer);
    }
  }
}
// Fallback after a dropped stream: poll the session object until idle.
async function watchRest(job, sessionId, texts, threads, ac, timer) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await cma('GET', `/sessions/${sessionId}`);
    if (s.status === 'idle') { clearTimeout(timer); ac.abort();
      job.stats = { cost_usd: Number(s.usage?.list_cost?.amount || 0) / 100, output_tokens: s.usage?.output_tokens || 0, active_seconds: s.stats?.active_seconds, duration_seconds: s.stats?.duration_seconds, threads: threads.size };
      const oe = s.outcome_evaluations || []; if (oe.length) job.outcome = { result: oe[oe.length - 1].result, iterations: oe.length };
      const page = await cma('GET', `/sessions/${sessionId}/events?beta=true&limit=1000`).catch(() => ({ data: [] }));
      const all = texts.join('\n') + '\n' + (page.data || []).filter((e) => e.type === 'agent.message').map(textOf).join('\n');
      return extractReport(all, job.brand); }
    if (s.status === 'terminated') throw new Error('Session terminated');
  }
}

function rubric() { return fs.readFileSync([path.join(__dirname, 'docs', 'outcome.md'), path.join(__dirname, '..', 'outcome.md')].find(fs.existsSync), 'utf8'); }

async function runLive(job) {
  pushEv(job, { agent: 'Server', kind: 'sys', text: 'Creating Managed Agents session…' });
  const resources = MEMORY_STORE_ID ? [{ type: 'memory_store', memory_store_id: MEMORY_STORE_ID, access: 'read_write', instructions: `Brand memory. Read and update brands/${norm(job.brand)}.md.` }] : undefined;
  const session = await cma('POST', '/sessions', {
    agent: RUN_AGENT, environment_id: ENVIRONMENT_ID, title: `Greenwash Watch: ${job.brand}`,
    budget: { type: 'limit', max_list_cost: { amount: String(process.env.BUDGET_CENTS || 400), currency: 'USD' } },
    ...(resources ? { resources } : {}),
    initial_events: process.env.USE_OUTCOME === '0'
      ? [{ type: 'user.message', content: [{ type: 'text', text: PROMPT(job.brand) }] }]
      : [{ type: 'user.define_outcome', description: PROMPT(job.brand), max_iterations: Number(process.env.MAX_ITER || 1), rubric: { type: 'text', content: rubric() } }],
  });
  job.sessionId = session.id;
  pushEv(job, { agent: 'Server', kind: 'sys', text: `Session ${session.id} started${JUDGE_ID ? ' · Judge + Prosecutor + Defender' : ''}${MEMORY_STORE_ID ? ' · brand memory attached' : ''}` });
  lastRun = { session_id: session.id, brand: job.brand, started: Date.now() };
  const r = await watch(job, session.id);
  lastRun = { ...lastRun, stats: job.stats, outcome: job.outcome, finished: Date.now() };
  fs.writeFileSync(path.join(DATA_DIR, '_lastrun.json'), JSON.stringify(lastRun));
  return r;
}
let lastRun = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, '_lastrun.json'), 'utf8')); } catch { return null; } })();

// Steering: preset nudges only (no free text from the public), max 3 per job.
const STEER = {
  deeper: 'Steering from the user: dig deeper on the single most prominent claim. Find one more independent source for it.',
  rulings: 'Steering from the user: prioritise any regulator or court rulings (ASA, CMA, ACM, FTC, AGCM, courts) about this brand from the last 3 years.',
  packaging: 'Steering from the user: make sure at least one claim covers packaging or product-level labels, if the brand makes any.',
  wrap: 'Steering from the user: you have enough. Wrap up now and give the final JSON.',
};
async function steer(job, key) {
  if (!STEER[key]) throw new Error('unknown preset');
  if (!job.sessionId || job.status !== 'running') throw new Error('job is not running');
  job.steers = (job.steers || 0) + 1; if (job.steers > 3) throw new Error('max 3 steers per run');
  await cma('POST', `/sessions/${job.sessionId}/events?beta=true`, { events: [{ type: 'user.message', content: [{ type: 'text', text: STEER[key] }] }] });
  pushEv(job, { agent: 'You', kind: 'steer', text: STEER[key].replace('Steering from the user: ', '') });
}

// Scheduled deployment ingestion: finished deployment-run sessions land in "Recently checked".
async function ingestDeploymentRuns() {
  if (MOCK || !DEPLOYMENT_ID) return;
  try {
    const runs = await cma('GET', `/deployment_runs?beta=true&deployment_id=${DEPLOYMENT_ID}`);
    const doneF = path.join(DATA_DIR, '_ingested.json');
    const done = new Set(fs.existsSync(doneF) ? JSON.parse(fs.readFileSync(doneF, 'utf8')) : []);
    for (const r of (runs.data || []).slice(0, 10)) {
      if (!r.session_id || done.has(r.session_id)) continue;
      const s = await cma('GET', `/sessions/${r.session_id}`);
      if (s.status === 'running') continue;
      const page = await cma('GET', `/sessions/${r.session_id}/events?beta=true&limit=1000`);
      const text = (page.data || []).filter((e) => e.type === 'agent.message' && !e.session_thread_id).map(textOf).join('\n');
      const rep = extractReport(text, '');
      if (rep.brand && (rep.claims || []).length) { rep.scheduled = true; persist(rep.brand, rep, r.session_id, 'scheduled'); }
      done.add(r.session_id); fs.writeFileSync(doneF, JSON.stringify([...done]));
      lastSched = { run_id: r.id, session_id: r.session_id, brand: rep.brand, trigger: r.trigger_context?.type, cost_usd: Number(s.usage?.list_cost?.amount || 0) / 100, created_at: r.created_at };
      fs.writeFileSync(path.join(DATA_DIR, '_lastsched.json'), JSON.stringify(lastSched));
    }
  } catch (e) { console.error('ingest', e.message); }
}
let lastSched = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, '_lastsched.json'), 'utf8')); } catch { return null; } })();
if (!MOCK && DEPLOYMENT_ID) { setTimeout(ingestDeploymentRuns, 5000); setInterval(ingestDeploymentRuns, 10 * 60e3); }

// "Under the hood": live IDs + versions, cached 5 min.
let hoodCache = null;
async function hood() {
  if (MOCK) return { mode: 'mock' };
  if (hoodCache && Date.now() - hoodCache.at < 5 * 60e3) return { ...hoodCache.data, last_run: lastRun, last_scheduled: lastSched };
  const ag = async (id) => { if (!id) return null; try { const a = await cma('GET', `/agents/${id}`); return { id: a.id, name: a.name, version: a.version, model: a.model?.id || a.model }; } catch { return { id }; } };
  const [judge, pros, def, cons] = await Promise.all([ag(RUN_AGENT), ag(PROSECUTOR_ID), ag(DEFENDER_ID), ag(CONSULTANT_ID)]);
  let env = null, dep = null, mem = null;
  try { const e = await cma('GET', `/environments/${ENVIRONMENT_ID}`); env = { id: e.id, name: e.name, networking: e.config?.networking?.type }; } catch { env = { id: ENVIRONMENT_ID }; }
  if (DEPLOYMENT_ID) try { const d = await cma('GET', `/deployments/${DEPLOYMENT_ID}?beta=true`); dep = { id: d.id, status: d.status, cron: d.schedule?.expression, tz: d.schedule?.timezone, next: (d.schedule?.upcoming_runs_at || [])[0], last_run_at: d.schedule?.last_run_at }; } catch { dep = { id: DEPLOYMENT_ID }; }
  if (MEMORY_STORE_ID) try { const r = await fetch(`${API}/memory_stores/${MEMORY_STORE_ID}/memories?path_prefix=/`, { headers: { ...HEADERS, 'anthropic-beta': 'agent-memory-2026-07-22' } }); const j = await r.json(); mem = { id: MEMORY_STORE_ID, files: (j.data || []).map((m) => m.path).filter(Boolean).slice(0, 50) }; } catch { mem = { id: MEMORY_STORE_ID }; }
  const data = { mode: 'live', agents: { judge, prosecutor: pros, defender: def, consultant: cons }, environment: env, deployment: dep, memory: mem, outcome: { max_iterations: Number(process.env.MAX_ITER || 1), rubric: 'docs/outcome.md' } };
  hoodCache = { at: Date.now(), data };
  return { ...data, last_run: lastRun, last_scheduled: lastSched };
}

async function runMock(job) {
  const steps = ['MOCK MODE: no API key, so no real agent is called', 'Pretending to search the web…', 'Pretending to fetch sources…', 'Rating claims…'];
  for (const s of steps) { pushEv(job, { agent: 'Mock', kind: 'sys', text: s }); await new Promise((r) => setTimeout(r, 600)); }
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock-report.json'), 'utf8'));
  r.requested_brand = job.brand;
  return r;
}

function endStream(job) { for (const c of job.clients) { c.write(`event: end\ndata: ${JSON.stringify({ status: job.status })}\n\n`); c.end(); } job.clients.clear(); }
const pub = (j) => ({ id: j.id, brand: j.brand, status: j.status, mock: j.mock, cached: j.cached, sessionId: j.sessionId, progress: j.progress, events: j.events, report: j.report, error: j.error, outcome: j.outcome, stats: j.stats, steers: j.steers || 0 });
function startJob(brand, ip) {
  const id = crypto.randomUUID();
  const hit = !MOCK && cached(brand);
  if (hit) {
    const job = { id, brand, status: 'done', mock: false, cached: true, events: [], clients: new Set(), progress: [{ t: Date.now(), s: `Cached report from ${new Date(hit.saved_at).toISOString().slice(0, 16).replace('T', ' ')} UTC (no new agent run)` }], report: hit.report, error: null };
    jobs.set(id, job); return job;
  }
  if (!MOCK) { const lim = checkLimits(ip); if (lim) return { limited: lim }; }
  const job = { id, brand, status: 'running', mock: MOCK, progress: [], events: [], clients: new Set(), report: null, error: null };
  jobs.set(id, job);
  (MOCK ? runMock(job) : runLive(job))
    .then((r) => { job.report = r; job.status = 'done'; endStream(job); if (!MOCK && (r.claims || []).length) persist(brand, r, job.sessionId); })
    .catch((e) => { job.error = String(e.message || e); job.status = 'error'; endStream(job); });
  return job;
}

// --- HTTP ---
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
  if (BASE && req.url === BASE) { res.writeHead(301, { location: BASE + '/' }); return res.end(); }
  if (BASE && req.url.startsWith(BASE + '/')) req.url = req.url.slice(BASE.length);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, mode: MOCK ? 'mock' : 'live', limits: { perIpPerHour: PER_IP_PER_HOUR, globalPerDay: GLOBAL_PER_DAY, usedToday: dayCount } });
  if (url.pathname === '/api/recent') return send(res, 200, recent());
  if (url.pathname === '/api/leaderboard') return send(res, 200, leaderboard());
  const rm = url.pathname.match(/^\/api\/recent\/([a-z0-9-]+)$/);
  if (rm) { const f = path.join(DATA_DIR, rm[1] + '.json'); return fs.existsSync(f) ? send(res, 200, JSON.parse(fs.readFileSync(f, 'utf8'))) : send(res, 404, { error: 'not found' }); }
  if (url.pathname === '/api/cases') return send(res, 200, JSON.parse(fs.readFileSync(path.join(__dirname, 'public/cases.json'))));
  if (url.pathname === '/api/research' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let brand = '';
      try { brand = String(JSON.parse(body || '{}').brand || '').trim().slice(0, 80); } catch {}
      if (!brand) return send(res, 400, { error: 'brand is required' });
      const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop()).trim()) || req.socket.remoteAddress;
      const job = startJob(brand, ip);
      if (job.limited) return send(res, 429, { error: job.limited });
      send(res, 202, { jobId: job.id, mode: MOCK ? 'mock' : 'live', cached: !!job.cached });
    });
    return;
  }
  if (url.pathname === '/api/cma') { try { return send(res, 200, await hood()); } catch (e) { return send(res, 500, { error: e.message }); } }
  const sm = url.pathname.match(/^\/api\/research\/([\w-]+)\/stream$/);
  if (sm) { const j = jobs.get(sm[1]); if (!j) return send(res, 404, { error: 'unknown job' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no', connection: 'keep-alive' });
    for (const e of j.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (j.status !== 'running') { res.write(`event: end\ndata: ${JSON.stringify({ status: j.status })}\n\n`); return res.end(); }
    j.clients.add(res); const ka = setInterval(() => res.write(': ka\n\n'), 20000); req.on('close', () => { clearInterval(ka); j.clients.delete(res); }); return; }
  const st = url.pathname.match(/^\/api\/research\/([\w-]+)\/steer$/);
  if (st && req.method === 'POST') { let body = ''; req.on('data', (c) => { body += c; if (body.length > 1e3) req.destroy(); });
    req.on('end', async () => { const j = jobs.get(st[1]); if (!j) return send(res, 404, { error: 'unknown job' });
      let key = ''; try { key = JSON.parse(body || '{}').preset; } catch {}
      if (j.mock) { pushEv(j, { agent: 'You', kind: 'steer', text: '(mock) ' + key }); return send(res, 200, { ok: true }); }
      try { await steer(j, key); send(res, 200, { ok: true }); } catch (e) { send(res, 400, { error: e.message }); } }); return; }
  const m = url.pathname.match(/^\/api\/research\/([\w-]+)$/);
  if (m) { const j = jobs.get(m[1]); return j ? send(res, 200, pub(j)) : send(res, 404, { error: 'unknown job' }); }

  // static
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(__dirname, 'public', p);
  if (!file.startsWith(path.join(__dirname, 'public'))) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Greenwash Watch on http://localhost:${PORT}  [${MOCK ? 'MOCK mode, example data' : 'LIVE: Claude Managed Agents'}]`));
