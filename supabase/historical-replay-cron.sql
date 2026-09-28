-- Optional weekly refresh after historical-replay is deployed and manually smoke-tested.
-- Reuses existing Vault secrets.
select cron.schedule(
  'historical-replay-weekly',
  '10 1 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
           || '/functions/v1/historical-replay',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-monitor-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')
    ),
    body := '{"lookback_days":365,"cadence_days":7}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
