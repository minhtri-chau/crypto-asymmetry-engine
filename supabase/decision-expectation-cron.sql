select cron.schedule(
 'decision-expectation','15 3 * * *',
 $$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/decision-expectation',
  headers := jsonb_build_object('Content-Type','application/json','x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
 );
 $$
);
