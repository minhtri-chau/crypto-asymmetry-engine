-- v8.9.6 Signal Outcome Engine
-- Run after deploying signal-outcomes with JWT verification OFF.
-- Reuses Vault secrets: project_url and monitor_cron_secret.

select cron.unschedule(jobid)
from cron.job
where jobname = 'signal-outcomes-daily';

select cron.schedule(
  'signal-outcomes-daily',
  '45 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
           || '/functions/v1/signal-outcomes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-monitor-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
