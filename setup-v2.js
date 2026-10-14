// Creates: memory store (seeded watchlist), Prosecutor + Defender agents, Judge coordinator (multiagent_20261001),
// and a daily scheduled deployment. Appends IDs to ../.env (or ./.env). Idempotent: skips anything already in env.
const fs = require('fs'), path = require('path');
const envFile = [path.join(__dirname, '..', 'greenwash', '.env'), path.join(__dirname, '.env')].find(fs.existsSync);
for (const l of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const E = process.env, API = 'https://api.anthropic.com/v1';
async function call(method, p, body, beta = 'managed-agents-2026-04-01') {
  const r = await fetch(API + p, { method, headers: { 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': beta, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 600)}`); return JSON.parse(t);
}
const save = (k, v) => { fs.appendFileSync(envFile, `\n${k}=${v}`); E[k] = v; console.log(k, v); };
const MEM = 'agent-memory-2026-07-22';
const TOOLS = [{ type: 'agent_toolset_20260401', default_config: { enabled: true, permission_policy: { type: 'always_allow' } }, configs: [{ name: 'bash', enabled: false }] }];
const MODEL = 'claude-sonnet-5-5';
(async () => {
  if (!E.MEMORY_STORE_ID) {
    const s = await call('POST', '/memory_stores', { name: 'Greenwash Brand Memory', description: 'One file per brand: brands/<slug>.md with last checked date, claims seen, verdicts, and what changed. watchlist.md + rotation.md drive the daily scheduled run.' }, MEM);
    save('MEMORY_STORE_ID', s.id);
    const brands = fs.readFileSync(path.join(__dirname, 'docs', 'brands.md'), 'utf8');
    await call('POST', `/memory_stores/${s.id}/memories`, { path: '/watchlist.md', content: brands }, MEM);
    await call('POST', `/memory_stores/${s.id}/memories`, { path: '/rotation.md', content: '# Rotation\nNext index: 1\n(Pick the brand at this position in the watchlist, then increment. Wrap to 1 after the last brand.)\n\n## Log\n' }, MEM);
  }
  const brief = 'Keep it cheap: at most 4 web_search and 4 web_fetch calls. Quote exact wording, give URLs and dates. Use relative dates (last ~12 months). Defamation-safe wording; never allege intent unless quoting a ruling.';
  if (!E.PROSECUTOR_ID) save('PROSECUTOR_ID', (await call('POST', '/agents', { name: 'Prosecutor', model: MODEL, tools: TOOLS,
    system: `You are the Prosecutor in a greenwashing review. For the brand you are given, find up to 4 of its recent environmental marketing claims and the strongest independent evidence AGAINST each (regulator rulings, NGO investigations, data contradicting the claim, vague terms banned by EU 2024/825 or the UK CMA Green Claims Code). ${brief} Reply with a compact bullet list: claim | brand source URL + date | the case against | evidence URLs.` })).id);
  if (!E.DEFENDER_ID) save('DEFENDER_ID', (await call('POST', '/agents', { name: 'Defender', model: MODEL, tools: TOOLS,
    system: `You are the Defender in a greenwashing review. For the brand (and any claims) you are given, find the strongest substantiation FOR each claim: third-party certifications, verified data (SBTi, CDP, audited reports), scope qualifiers the brand did include. ${brief} Be honest: say "no substantiation found" when there is none. Reply with a compact bullet list: claim | the case for | evidence URLs.` })).id);
  if (!E.JUDGE_ID) save('JUDGE_ID', (await call('POST', '/agents', { name: 'Judge', model: MODEL, tools: TOOLS,
    system: `You are the Judge of Greenwash Watch. You coordinate two subagents: Prosecutor (case against) and Defender (case for).
Workflow for a brand:
1. Read your brand memory file brands/<slug>.md in the memory store if it exists (what you found last time).
2. Delegate to Prosecutor with the brand name. When it reports, delegate to Defender with the brand and the exact claims Prosecutor listed.
3. Weigh both sides and give each claim a verdict: "holds up" | "unsubstantiated" | "misleading" ("unsubstantiated" when evidence is insufficient). Cite the rule (UK CMA Green Claims Code, EU Directive 2024/825, ASA CAP Code, FTC Green Guides, etc).
4. Update brands/<slug>.md in memory: last checked date, claims + verdicts, and what changed since the previous check. Keep it under 40 lines.
Do not do web research yourself unless a subagent failed. Defamation-safe wording ("our assessment").
End your final message with ONLY a fenced \`\`\`json block:
{"brand":"","summary":"","changes_since_last":"","claims":[{"claim":"","source_url":"","date":"","verdict":"","reason":"","rule":"","prosecution":"","defense":"","evidence":[{"title":"","url":""}]}]}`,
    multiagent: { type: 'multiagent_20261001', subagents: { type: 'enabled', inline_agents: { type: 'disabled' }, predefined_agents: [{ type: 'agent', id: E.PROSECUTOR_ID }, { type: 'agent', id: E.DEFENDER_ID }] }, workflows: { type: 'disabled' } } })).id);
  if (!E.DEPLOYMENT_ID) save('DEPLOYMENT_ID', (await call('POST', '/deployments?beta=true', { name: 'Greenwash Watch daily rotation', agent: E.JUDGE_ID, environment_id: E.ENVIRONMENT_ID,
    resources: [{ type: 'memory_store', memory_store_id: E.MEMORY_STORE_ID, access: 'read_write', instructions: 'Brand memory. watchlist.md lists brands; rotation.md holds the next index.' }],
    initial_events: [{ type: 'user.message', content: [{ type: 'text', text: 'This is a scheduled rotation run (daily check, as of today). Open rotation.md and watchlist.md in the memory store, take the ONE brand at the next index, run your normal Prosecutor/Defender/Judge review for it, update brands/<slug>.md, then increment the index in rotation.md and append a log line (date, brand). Keep cost low.' }] }],
    schedule: { type: 'cron', expression: '0 8 * * *', timezone: 'Europe/Stockholm' },
    budget: { type: 'limit', max_list_cost: { amount: '300', currency: 'USD' } } })).id);
})().catch((e) => { console.error(e.message); process.exit(1); });
