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
{"brand":"","summary":"","claims":[{"claim":"","source_url":"","date":"","verdict":"holds up|unsubstantiated|misleading","reason":"","rule":"","evidence":[{"title":"","url":""}]}]}`;

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
function persist(brand, report, sessionId) {
  const rec = { brand, saved_at: Date.now(), session_id: sessionId || null, report };
  fs.writeFileSync(path.join(DATA_DIR, norm(brand) + '.json'), JSON.stringify(rec));
}
function recent() {
  return fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    try { const r = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); return { brand: r.brand, slug: f.slice(0, -5), saved_at: r.saved_at, claims: (r.report.claims || []).length }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.saved_at - a.saved_at).slice(0, 30);
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

async function runLive(job) {
  const step = (s) => job.progress.push({ t: Date.now(), s });
  step('Creating Managed Agents session…');
  // One call: create session + seed user.message via initial_events (documented).
  const session = await cma('POST', '/sessions', {
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    title: `Greenwash Watch: ${job.brand}`,
    budget: { type: 'limit', max_list_cost: { amount: String(process.env.BUDGET_CENTS || 300), currency: 'USD' } },
    initial_events: process.env.USE_OUTCOME === '0'
      ? [{ type: 'user.message', content: [{ type: 'text', text: PROMPT(job.brand) }] }]
      : [{ type: 'user.define_outcome', description: PROMPT(job.brand), max_iterations: Number(process.env.MAX_ITER || 1),
           rubric: { type: 'text', content: fs.readFileSync([path.join(__dirname, 'docs', 'outcome.md'), path.join(__dirname, '..', 'outcome.md')].find(fs.existsSync), 'utf8') } }],
  });
  job.sessionId = session.id;
  step(`Session ${session.id} running. The agent is searching the web…`);

  const seen = new Set();
  const texts = [];
  const deadline = Date.now() + 15 * 60 * 1000;
  // Poll the documented event-list endpoint. NOTE: pagination params are not
  // documented in the pages we read; we re-read the list each poll and de-dup by id.
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const page = await cma('GET', `/sessions/${session.id}/events?beta=true`);
    for (const ev of page.data || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      if (ev.type === 'agent.tool_use') step(`Tool: ${ev.name || 'tool'}${ev.input && ev.input.query ? ' (' + ev.input.query + ')' : ev.input && ev.input.url ? ' (' + ev.input.url + ')' : ''}`);
      if (ev.type === 'agent.message') for (const c of ev.content || []) if (c.type === 'text') texts.push(c.text);
      if (ev.type === 'session.error') throw new Error('session.error: ' + ((ev.error && ev.error.message) || 'unknown'));
      if (ev.type === 'session.status_terminated') throw new Error('Session terminated');
      if (ev.type === 'session.status_idle') {
        const why = ev.stop_reason && ev.stop_reason.type;
        if (why === 'requires_action') throw new Error('Session needs a tool confirmation (requires_action). Use always_allow for web tools in this demo.');
        if (why === 'budget_reached') throw new Error('Session budget reached');
        step('Agent finished. Parsing report…');
        return extractReport(texts.join('\n'), job.brand);
      }
    }
  }
  throw new Error('Timed out after 15 minutes');
}

async function runMock(job) {
  const steps = ['MOCK MODE: no API key, so no real agent is called', 'Pretending to search the web…', 'Pretending to fetch sources…', 'Rating claims…'];
  for (const s of steps) { job.progress.push({ t: Date.now(), s }); await new Promise((r) => setTimeout(r, 600)); }
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock-report.json'), 'utf8'));
  r.requested_brand = job.brand;
  return r;
}

function startJob(brand, ip) {
  const id = crypto.randomUUID();
  const hit = !MOCK && cached(brand);
  if (hit) {
    const job = { id, brand, status: 'done', mock: false, cached: true, progress: [{ t: Date.now(), s: `Cached report from ${new Date(hit.saved_at).toISOString().slice(0, 16).replace('T', ' ')} UTC (no new agent run)` }], report: hit.report, error: null };
    jobs.set(id, job); return job;
  }
  if (!MOCK) { const lim = checkLimits(ip); if (lim) return { limited: lim }; }
  const job = { id, brand, status: 'running', mock: MOCK, progress: [], report: null, error: null };
  jobs.set(id, job);
  (MOCK ? runMock(job) : runLive(job))
    .then((r) => { job.report = r; job.status = 'done'; if (!MOCK && (r.claims || []).length) persist(brand, r, job.sessionId); })
    .catch((e) => { job.error = String(e.message || e); job.status = 'error'; });
  return job;
}

// --- HTTP ---
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, mode: MOCK ? 'mock' : 'live', limits: { perIpPerHour: PER_IP_PER_HOUR, globalPerDay: GLOBAL_PER_DAY, usedToday: dayCount } });
  if (url.pathname === '/api/recent') return send(res, 200, recent());
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
      const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
      const job = startJob(brand, ip);
      if (job.limited) return send(res, 429, { error: job.limited });
      send(res, 202, { jobId: job.id, mode: MOCK ? 'mock' : 'live', cached: !!job.cached });
    });
    return;
  }
  const m = url.pathname.match(/^\/api\/research\/([\w-]+)$/);
  if (m) { const j = jobs.get(m[1]); return j ? send(res, 200, j) : send(res, 404, { error: 'unknown job' }); }

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
