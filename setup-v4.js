// v4: per-claim source capture. Prosecutor v2 (source rules) + Judge new version (schema: source_url, source_title, quoted_excerpt,
// pins Prosecutor v2); points the deployment at the new Judge version. Models unchanged.
const fs = require('fs'), path = require('path');
const envFile = [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')].find(fs.existsSync);
for (const l of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const E = process.env, API = 'https://api.anthropic.com/v1';
const ids = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'cma', 'IDS.env'), 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: { 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'managed-agents-2026-04-01', 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 800)}`); return JSON.parse(t);
}
const PROS_RULE = '\nSOURCES (required): for every claim give the exact URL of the page where you found the claim (the brand\'s own page, ad, report PDF or product page you actually fetched; not a search-results page, never a guessed or reconstructed URL), that page\'s title, and a verbatim excerpt of at most 30 words containing the claim. If you could not fetch the brand page, give the URL of the source that quotes it and say so. Format each bullet as: claim | source_url | source_title | quoted_excerpt | date | the case against | evidence URLs.';
const JUDGE_RULE = '\nSources: every claim MUST carry "source_url" (the exact page where the claim was found, taken from the Prosecutor\'s report; never invent or reconstruct a URL; leave "" if none was fetched), "source_title" and "quoted_excerpt" (verbatim, at most 30 words).';
(async () => {
  const p = await call('GET', `/agents/${ids.PROSECUTOR_ID}`);
  let pv = p.version;
  if (!/SOURCES \(required\)/.test(p.system)) { const np = await call('POST', `/agents/${ids.PROSECUTOR_ID}`, { version: p.version, model: p.model, system: p.system.trimEnd() + PROS_RULE }); pv = np.version; }
  console.log('PROSECUTOR_VERSION', pv);
  const j = await call('GET', `/agents/${ids.JUDGE_ID}`);
  let sys = j.system;
  if (!/quoted_excerpt/.test(sys)) sys = sys.replace('"claim":"","source_url":"",', '"claim":"","source_url":"","source_title":"","quoted_excerpt":"",').replace('End your final message with ONLY', JUDGE_RULE.trim() + '\nEnd your final message with ONLY');
  const preds = (j.multiagent.subagents.predefined_agents || []).map((a) => (a.id === ids.PROSECUTOR_ID ? { ...a, version: pv } : a));
  const ma = { ...j.multiagent, subagents: { ...j.multiagent.subagents, predefined_agents: preds } };
  const nj = await call('POST', `/agents/${ids.JUDGE_ID}`, { version: j.version, model: j.model, system: sys, multiagent: ma });
  console.log('JUDGE_VERSION', nj.version, nj.model?.id, /quoted_excerpt/.test(nj.system), JSON.stringify(nj.multiagent.subagents.predefined_agents));
  const dep = await call('GET', `/deployments/${ids.DEPLOYMENT_ID}?beta=true`);
  const nd = await call('POST', `/deployments/${ids.DEPLOYMENT_ID}?beta=true`, { agent: { type: 'agent', id: ids.JUDGE_ID, version: nj.version }, budget: dep.budget });
  console.log('deployment', JSON.stringify(dep.agent), '->', JSON.stringify(nd.agent));
})().catch((e) => { console.error(e.message); process.exit(1); });
