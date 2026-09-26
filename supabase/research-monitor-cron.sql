-- v8: evaluate active research once per day at 00:30 UTC.
-- Reuses Vault secrets `project_url` and `monitor_cron_secret`.
select cron.unschedule(jobid) from cron.job where jobname = 'research-monitor-daily';
select cron.schedule(
  'research-monitor-daily',
  '30 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/research-monitor',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);