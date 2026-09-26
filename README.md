# Crypto Asymmetry Engine v5.4

Security and reliability pass before real persistence.

## Fixes
- Local `npm run dev` now shows Trend feed unavailable instead of an endless Loading state when Vercel functions are absent.
- Trend endpoint limits upstream fan-out to batches of 2 with a short delay and caches results for 30 minutes.
- BTC history is reused instead of fetched repeatedly.
- Portfolio explicitly labels current persistence as LOCAL STORAGE.
- Legacy snapshot migration from v5/v5.1 remains enabled.

## Database
`supabase.sql` now:
- references authenticated Supabase users
- enables Row Level Security on plans and snapshots
- limits CRUD to `auth.uid() = user_id`
- revokes table access from anonymous users
- grants only required operations to authenticated users

The frontend is intentionally NOT connected yet. Create/configure the Supabase project, run the SQL, and add environment values first. Until then the app remains local-first.

## Next after Supabase configuration
- Auth + database sync with local-to-cloud migration
- Background rule checks / notifications
- Reliable unlock provider
- Stablecoin-flow + sentiment regime inputs
- Asset-specific fundamentals for AKT/LINK/TAO/TIA/SUI
