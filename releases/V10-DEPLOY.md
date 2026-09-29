# v10 Catalyst & Unlock Intelligence

## Goal
Turn the old qualitative catalyst/unlock prose into structured, dated, source-backed event intelligence.

## First release philosophy
v10.0 is evidence capture, monitoring and AI context. It does NOT change deterministic Setup/Thesis/Decision thresholds.

## Deploy
1. Apply V10-MIGRATION.sql and append to current supabase.sql.
2. Add `api/catalyst-intelligence.js` from the package to CURRENT main.
3. Apply frontend patch to CURRENT main.
4. Apply AI patch if desired; this evidence IS relevant to AI unlike v9.9 calibration readiness.
5. Apply Decision display-only policy.
6. Deploy Vercel. This adds one Vercel API function, so verify Hobby function count remains <=12.

## Initial operation
Open AAVE Research and press Refresh event intelligence. Verify sources manually on the first run, especially any exact unlock date or percentage.

## Release-blocking checks
- No invented exact dates.
- No invented unlock/emission amounts.
- Every stored event has at least one resolved source for factual event claims.
- HTTPS links only in UI.
- Omitted events are not automatically deleted.
- Completed/cancelled/delayed requires affirmative sourced evidence.
- Same event_key updates rather than duplicates.
- Unknown date/supply stays unknown.
- One-time unlock and ongoing emissions are separate event types.
- No deterministic score/posture changes.
- Existing v9.9 Calibration Lab remains excluded from AI.
- v9.7 similarity remains observational.
- Promotion Review brace regression remains fixed.
