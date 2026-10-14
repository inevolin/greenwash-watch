# Greenwash Watch

Greenwash Watch is an evidence-based greenwashing watchdog built on **Claude Managed Agents**. Give it a brand and an agent searches the web for the brand's environmental claims. It quotes each claim, looks for independent evidence, and rates it **holds up / unsubstantiated / misleading**, with citations. Verdicts are the agent's assessment of public evidence, not legal findings.

The site includes:
- a landing page with verified stats (European Commission, UK CMA)
- the regulatory context (EU Directive 2024/825, CMA Green Claims Code, and the status of the EU Green Claims Directive)
- a gallery of 10 real regulator and court rulings, used as the eval set
- live brand research, with a "recent research" list

## Run locally (Node ≥ 18, zero dependencies)
```bash
cp .env.example .env      # add ANTHROPIC_API_KEY, AGENT_ID, ENVIRONMENT_ID
npm start                 # http://localhost:3000
MOCK=1 npm start          # offline mode with canned, clearly-labelled example data
npm test                  # smoke test (run against a MOCK=1 server)
```
If no key is set, the server falls back to mock mode automatically.

## Create the agent and environment (one time)
Run `node setup-cma.js`. It creates a cloud environment and the agent, using `docs/interview-answers.md` as the system prompt and `agent_toolset_20260401` as the tools. It then appends the IDs to `.env`.
After running it:
- Set the environment's networking to **unrestricted**. With `limited` networking and an empty `allowed_hosts` list, web_search and web_fetch are blocked.
- Disable the `bash` tool on the agent.

Each live search creates a session whose `user.define_outcome` uses `docs/outcome.md` as its rubric, with a per-session budget.

## Abuse and cost controls (env vars)
| Var | Default | Meaning |
|---|---|---|
| `RATE_PER_IP_PER_HOUR` | 2 | live searches per visitor IP per hour |
| `RATE_GLOBAL_PER_DAY` | 20 | live searches per UTC day, across all visitors |
| `CACHE_HOURS` | 168 | a repeated brand returns the saved report instead of a new run |
| `BUDGET_CENTS` | 300 | hard spend cap per CMA session ($3) |
| `MAX_ITER` | 1 | outcome-grader revision rounds |
| `TRUST_PROXY` | 0 | set to 1 behind a proxy (Render/Fly) to use X-Forwarded-For |
| `DATA_DIR` | ./data | where completed reports are saved |

Cache hits and the recent-research list never call the API.

## Deploy (Render, free)
New → Blueprint → select this repo (it uses `render.yaml` and the `Dockerfile`). Then set **`ANTHROPIC_API_KEY` as a secret in the Render dashboard**. Never commit the key.
Render's free tier has an ephemeral disk, so new reports are lost on redeploy. The seeded `data/shell.json` stays.

## Docs
`docs/` contains the interview answers, outcome rubric, evals (10 verified rulings) and the 40-brand watchlist.
