# LAUNCH: recreate Greenwash Watch on Claude Managed Agents

Key: put `ANTHROPIC_API_KEY=` in `.env` (chmod 600, git-ignored). IDs land in `IDS.env` (no secrets).
Headers on every call: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: managed-agents-2026-04-01`
(memory-store endpoints: `anthropic-beta: agent-memory-2026-07-22` instead).

## Resumable sequence (each step skips objects already in IDS.env)
| # | Primitive | Call | Saves |
|---|---|---|---|
| 1 | 📦 Environment | `node ../setup-cma.js` → `POST /v1/environments` `{config:{type:"cloud",networking:{type:"unrestricted"}}}` | `ENVIRONMENT_ID` |
| 2 | 🧠 Memory store | `node ../setup-v2.js` → `POST /v1/memory_stores` + seed `/watchlist.md`, `/rotation.md` | `MEMORY_STORE_ID` |
| 3 | 🤖 Prosecutor, Defender | same script → `POST /v1/agents` (toolset, bash disabled, always_allow) | `PROSECUTOR_ID`, `DEFENDER_ID` |
| 4 | 🤖 Judge | same script → `POST /v1/agents` with `multiagent: {type:"multiagent_20261001", subagents:{predefined_agents:[P,D], inline_agents:disabled}, workflows: disabled}`; system prompt in `agent.json` | `JUDGE_ID` |
| 5 | 🗓️ Deployment | same script → `POST /v1/deployments?beta=true` cron `0 8 * * *` Europe/Stockholm, memory store in `resources[]`, budget 300 | `DEPLOYMENT_ID` |
| 6 | ▶️ Manual run | `curl -X POST $BASE/deployments/$DEPLOYMENT_ID/run?beta=true -d '{}'` | run + session id |

## On demand (what the website does)
```bash
curl -sS $BASE/sessions -H ... -d '{
  "agent": "'$JUDGE_ID'", "environment_id": "'$ENVIRONMENT_ID'",
  "budget": {"type":"limit","max_list_cost":{"amount":"300","currency":"USD"}},
  "resources": [{"type":"memory_store","memory_store_id":"'$MEMORY_STORE_ID'","access":"read_write"}],
  "initial_events": [{"type":"user.define_outcome","description":"<first_prompt.txt with {{BRAND}}>",
     "rubric":{"type":"text","content":"<outcome.md>"},"max_iterations":1}]}'
```
Watch: `GET /v1/sessions/$SID/events/stream?beta=true` (SSE) plus `/threads/$TID/stream` per subagent. Steer: `POST /v1/sessions/$SID/events?beta=true` with a `user.message`.

## Updating the Judge
`POST /v1/agents/$JUDGE_ID` with `{"version": <current>, "system": ...}` bumps the version. Then run
`ENV_FILE=../.env evals/run-evals.sh <new_version> innocent persil klm`, and only if verdicts hold:
`POST /v1/deployments/$DEPLOYMENT_ID?beta=true {"agent":{"type":"agent","id":"$JUDGE_ID","version":<new>}}`.

## Console
https://platform.claude.com/workspaces/default/agents (switch workspace if the key isn't in Default)
