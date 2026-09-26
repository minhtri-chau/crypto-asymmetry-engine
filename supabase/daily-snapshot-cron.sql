-- v6.1 daily snapshot scheduler. Run AFTER deploying the `daily-snapshot` Edge Function.
-- Uses the same Vault project_url and monitor_cron_secret already configured for monitoring.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'crypto-asymmetry-daily-snapshot',
  '15 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/daily-snapshot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')
    ),
    body := jsonb_build_object('source','supabase-cron','time',now()),
    timeout_milliseconds := 20000
  );
  $$
);
