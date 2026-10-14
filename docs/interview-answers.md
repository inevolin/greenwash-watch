# /launch-your-agent interview answers

**Problem:** Green claims from major brands are everywhere and hard to check. Regulators and courts (ASA, CMA, ACM, AGCM, ACCC, EU national courts) keep finding them misleading. A cross-industry watchdog that checks claims against evidence, every day, does not exist.

**Input:** None per run; the agent works from its watchlist. It takes the 40-brand watchlist (8 industries × 5) and picks the next batch of about 6 brands from memory. A single brand can also be run on demand.

**Output:**
- **Daily:** a report per brand. For each claim:
  - the brand's **own quote**, with URL and date
  - a verdict: **holds up / unsubstantiated / misleading**
  - a one-line reason
  - **at least one independent contradicting or corroborating source**
  - the relevant rule (CMA Green Claims Code principle, or EU Directive 2024/825 / UCPD Annex I point)
- **Weekly (Mondays):** a cross-industry leaderboard. It ranks brands by the share of claims assessed as misleading or unsubstantiated and lists every rating's evidence links.

**Evidence and wording rules:**
- No verdict without both a brand quote and an independent source. If evidence is missing, the claim is marked "unsubstantiated (insufficient public evidence)", not misleading.
- Wording is always "Our assessment…" or "The available evidence does not support…".
- No claims about intent: never "lying", "deliberately", or "fraud". The one exception is citing a court that found exactly that.
- Regulator rulings are cited as rulings.

**Tools:** `web_search` finds recent claims, ads, sustainability reports, NGO analyses, and regulator or court decisions. `web_fetch` reads and quotes them exactly.

**Memory:** one entry per brand holds:
- last-run date
- claims seen (quote, URL, first seen, verdict)
- rulings
- evidence links

A rotation pointer picks the next 6 brands, oldest-checked first. Diffs show only new or changed claims.

**Trigger:**
- Daily cron at 08:00 Europe/Stockholm, using relative windows ("since last run for this brand", "rulings in the last 30 days").
- Weekly leaderboard every Monday, built from memory covering the last 7 days.

**Regulatory status (Oct 2026):**
- **In force:** EU Directive 2024/825 (Empowering Consumers) applies from 27 Sep 2026. It bans generic claims without proof of recognised excellent environmental performance, whole-product claims based on one aspect, offset-based "neutral" claims, and uncertified sustainability labels.
- **Still a proposal:** the Green Claims Directive (COM(2023)166). The Commission announced its intention to withdraw it on 20 Jun 2025 and trilogues were cancelled. It has not been formally withdrawn: the 2026 Commission Work Programme lists it as pending and Parliament marks it "Blocked" (Council). The agent cites it only as a proposal.
- **UK:** CMA Green Claims Code, plus the CAP/BCAP codes as applied by the ASA.

**v1 (hackathon):**
- 40-brand watchlist, 6 brands/day rotation
- 3-level verdicts with quote + contradicting source
- per-brand memory, daily cron
- weekly leaderboard (Markdown)
- evals on 10 real rulings

**v2:**
- non-English sources
- image and label claims
- alerts on new rulings
- human review queue before publication
- confidence scores
- right-of-reply field for brands

**Eval plan:**
- 10 verified rulings covering all 8 industries (evals.md) as known-misleading cases, plus controls with well-substantiated claims for false positives.
- Each run is scored against outcome.md, with a separate check for defamation-safe wording.
