// One-time: creates the CMA environment + agent and writes AGENT_ID / ENVIRONMENT_ID into ../.env
// Usage: node setup-cma.js   (never prints the API key)
const fs = require('fs'), path = require('path');
const envFile = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')].find(fs.existsSync) || path.join(__dirname, '.env');
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
if (env.AGENT_ID && env.ENVIRONMENT_ID) { console.log('Already set:', env.AGENT_ID, env.ENVIRONMENT_ID); process.exit(0); }
const H = { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'managed-agents-2026-04-01', 'content-type': 'application/json' };
const post = async (p, b) => { const r = await fetch('https://api.anthropic.com/v1' + p, { method: 'POST', headers: H, body: JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${p} ${r.status} ${t.slice(0, 400)}`); return JSON.parse(t); };
const interview = fs.readFileSync([path.join(__dirname, 'docs', 'interview-answers.md'), path.join(__dirname, '..', 'interview-answers.md')].find(fs.existsSync), 'utf8');
const SYSTEM = `You are Greenwash Watch, an evidence-based greenwashing watchdog. Follow this product spec exactly:\n\n${interview}\n\nHard rules: only rate a claim when you have fetched the brand's own wording AND at least one independent source; never invent URLs, quotes or rulings; use "our assessment" wording and never allege intent beyond what a cited ruling found. Be efficient: at most ~8 web searches and ~8 fetches per brand.`;
(async () => {
  const environment = await post('/environments', { name: 'greenwash-watch-env-' + Date.now(), config: { type: 'cloud', networking: { type: 'limited', allow_package_managers: false } } });
  const agent = await post('/agents', { name: 'Greenwash Watch', description: 'Evidence-based greenwashing watchdog: rates brand green claims holds up / unsubstantiated / misleading with citations.', model: env.MODEL || 'claude-sonnet-5-5', system: SYSTEM, tools: [{ type: 'agent_toolset_20260401' }] });
  fs.appendFileSync(envFile, `\nAGENT_ID=${agent.id}\nENVIRONMENT_ID=${environment.id}\n`);
  console.log('ENVIRONMENT_ID', environment.id); console.log('AGENT_ID', agent.id, 'version', agent.version, 'model', JSON.stringify(agent.model));
})().catch((e) => { console.error(e.message); process.exit(1); });
