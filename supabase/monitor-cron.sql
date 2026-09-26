-- v5.8 scheduler template. Run AFTER deploying the `monitor` Edge Function.
-- Replace the two placeholders, preferably with values stored in Supabase Vault.
-- Official Supabase docs recommend Vault for credentials used by scheduled Edge Function calls.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Recommended one-time setup (replace values before running):
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_RANDOM_MONITOR_CRON_SECRET', 'monitor_cron_secret');

select cron.schedule(
  'crypto-asymmetry-monitor-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/monitor',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')
    ),
    body := jsonb_build_object('source','supabase-cron','time',now()),
    timeout_milliseconds := 10000
  );
  $$
);
