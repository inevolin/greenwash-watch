// v3: Compliance Consultant (Opus) + Judge new version on Opus with Consultant in roster; points deployment at it.
const fs = require('fs'), path = require('path');
const envFile = [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')].find(fs.existsSync);
for (const l of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const E = process.env, API = 'https://api.anthropic.com/v1';
const ids = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'cma', 'IDS.env'), 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: { 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'managed-agents-2026-04-01', 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 800)}`); return JSON.parse(t);
}
const OPUS = { id: 'claude-opus-5-5', effort: { type: 'high' }, speed: 'standard' };
const TOOLS = [{ type: 'agent_toolset_20260401', default_config: { enabled: true, permission_policy: { type: 'always_allow' } }, configs: [{ name: 'bash', enabled: false }] }];
(async () => {
  const list = await call('GET', '/agents?limit=50');
  let cons = (list.data || []).find((a) => a.name === 'Compliance Consultant');
  if (!cons) cons = await call('POST', '/agents', { name: 'Compliance Consultant', model: OPUS, tools: TOOLS,
    system: 'You are the Compliance Consultant in a greenwashing review. You receive claims the Judge flagged as "unsubstantiated" or "misleading" with the reasons. For EACH claim write a compliant rewrite that a brand could lawfully publish under the UK CMA Green Claims Code (and DMCC Act 2024 enforcement) and EU rules (Directive 2024/825 ECGT banning generic claims like "eco-friendly"/"climate neutral" based on offsetting; Green Claims proposal requiring substantiation). Rewrites must be specific, scoped (product/site/scope 1-2-3), quantified, time-bound, and no broader than the evidence. Then list the evidence the brand would need to hold to make the rewrite (e.g. LCA to ISO 14044, third-party verification, certification ID, audited baseline). Do not do web research unless essential (max 2 searches). Reply with a compact bullet list: original claim | rewrite | evidence needed | rule.' });
  console.log('CONSULTANT_ID', cons.id);
  const j = await call('GET', `/agents/${ids.JUDGE_ID}`);
  let sys = j.system;
  if (!/Consultant/.test(sys)) {
    sys = sys.replace('two subagents: Prosecutor (case against) and Defender (case for).', 'three subagents: Prosecutor (case against), Defender (case for) and Compliance Consultant (compliant rewrites).')
      .replace(/(\n3\.[^\n]*\n)/, '$1' + '3b. Delegate to Compliance Consultant with every claim you rated "unsubstantiated" or "misleading" plus your reason. Put its output on each such claim as "rewrite" (compliant wording) and "evidence_needed" (array of strings).\n')
      .replace('"evidence":[{"title":"","url":""}]}', '"evidence":[{"title":"","url":""}],"rewrite":"","evidence_needed":[""]}');
  }
  const preds = [{ type: 'agent', id: ids.PROSECUTOR_ID }, { type: 'agent', id: ids.DEFENDER_ID }, { type: 'agent', id: cons.id }];
  const ma = { ...(j.multiagent || {}), subagents: { ...(j.multiagent?.subagents || {}), predefined_agents: preds } };
  const nj = await call('POST', `/agents/${ids.JUDGE_ID}`, { version: j.version, model: OPUS, system: sys, multiagent: ma });
  console.log('JUDGE_VERSION', nj.version, nj.model?.id, /Consultant/.test(nj.system));
  const dep = await call('GET', `/deployments/${ids.DEPLOYMENT_ID}?beta=true`);
  console.log('dep agent before', JSON.stringify(dep.agent));
  const nd = await call('POST', `/deployments/${ids.DEPLOYMENT_ID}?beta=true`, { agent: { type: 'agent', id: ids.JUDGE_ID, version: nj.version }, budget: { type: 'limit', max_list_cost: { amount: '400', currency: 'USD' } } });
  console.log('dep agent after', JSON.stringify(nd.agent), JSON.stringify(nd.budget));
})().catch((e) => { console.error(e.message); process.exit(1); });
