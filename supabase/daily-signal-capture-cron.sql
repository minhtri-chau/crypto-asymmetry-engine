-- v8.9.7 server-side daily signal capture
-- Run after deploying daily-signal-capture with JWT verification OFF.
-- 00:35 UTC: after research-monitor (00:30), before signal-outcomes (00:45).

select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-signal-capture';

select cron.schedule(
  'daily-signal-capture',
  '35 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
           || '/functions/v1/daily-signal-capture',
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
