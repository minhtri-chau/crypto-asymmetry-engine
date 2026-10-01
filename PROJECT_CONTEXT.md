# Project context — v10.7

Source of truth: GitHub main. Baseline: 5b034dc (v10.6.1). This file was absent from main and reconstructed from project history for this release.

## Decisions to preserve
- Coinbase spot universe only; dynamic scanner, private Research and owned positions.
- ChatGPT provides research reasoning; dashboard supports decisions, never executes trades.
- Research Priority, Setup Evidence, Thesis Strength and their coverage are separate.
- Missing evidence is uncertainty, never a guessed zero or bearish signal.
- Supabase stores private research; alerts are in-app, no email/Telegram.
- Refresh Research with AI runs quantitative, sourced, event and AI steps and continues after failures. Without AI runs quantitative only.
- Keep chart drag measurement, research removal and user fixes from main.
- Read and update this file for every revision; label implemented, pushed and deployed separately.
- Delivery: change ZIP for user to copy, commit and push. Vercel auto-deploys main.

## v10.7 implementation
Adoption and development evidence panel in Research, collected by existing authenticated sourced research. Saved in qualitative_research.intelligence JSON; no SQL migration or Supabase redeployment. Comparable sourced observations produce deterministic 30/90-day changes for usage/economics, 90/180-day changes for developer metrics. Definitions, dates, source links, missing coverage and stale data remain visible. USD TVL does not establish net deposits; addresses do not establish people; commits do not establish developer retention. No score, threshold, portfolio allocation or deterministic entry/exit changes. Existing records render unknown until a new sourced run. Uses existing AI configuration and costs.

Status: implemented locally; not pushed or deployed. Live baseline remains v10.6.1 until user deployment.
