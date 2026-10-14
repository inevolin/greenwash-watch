# Next directions (version rail)

## v1: Weekly leaderboard
- **What:** a weekly leaderboard of brands by share of misleading/unsubstantiated claims, built only from stored, cited verdicts.
- **Why deferred:** needs a few weeks of daily runs in memory first.
- **How:** a second deployment (`0 9 * * 1`, Europe/Stockholm) whose kickoff reads `brands/*.md` from the memory store (read_only) and writes `/mnt/session/outputs/leaderboard.md`; the site pulls it via the Files API (`scope_id=<session>`).

## v2: Alert delivery (Slack/email), drafts first
- **What:** when a brand flips to "misleading", draft a Slack/email alert.
- **Why deferred:** a write action to an external system plus a credential that isn't on hand.
- **How:** v2a mocks it as an outbox file (`/mnt/session/outputs/outbox/*.json`, schema-true Slack payload); v2b swaps in the Slack MCP server + vault credential, toolset gated `always_ask`.

## v3: Hardening
- **What:** lock networking down; per-claim `allowed_domains`.
- **Why deferred:** limited networking with empty `allowed_hosts` blocks web tools; needs a curated host list first.
- **How:** environment `networking: limited` + `allowed_hosts` (regulators, NGOs, brand domains), web tool `allowed_domains`.

## v4: More iterations for scheduled runs
- **What:** `max_iterations: 3` for the daily deployment (visitor runs stay at 1).
- **Why deferred:** cost cap for the demo.
- **How:** change `initial_events` of the deployment to a `user.define_outcome` with `rubric.content` = outcome.md and `max_iterations: 3`.

## v5: Advisor
- **What:** Opus advisor for the Judge's final weighing.
- **How:** `multiagent.advisor: {"type":"enabled","model":"claude-opus-5-5"}` in an agent update.

## Always
- Re-run `evals/run-evals.sh <version> <cases>` before promoting any new Judge version to the deployment (`POST /v1/deployments/<id>` with `agent: {type, id, version}`); promote only when verdicts hold.
