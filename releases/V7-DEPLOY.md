# v7 deployment

1. Upload/push the v7 repo files to GitHub `main`.
2. Preserve the existing genuine `package-lock.json` on GitHub. Dependencies are unchanged.
3. Vercel will deploy the frontend plus the new `/api/discovery` server endpoint.

No Supabase SQL migration.
No Edge Function redeploy.
No Cron changes.
No new secrets or environment variables.

After Vercel finishes, open Scanner. `Dynamic discovery` should appear above `Deep research & watchlist`.
