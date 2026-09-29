-- Run after decision-scorecard.
select cron.schedule('calibration-lab','55 2 * * *',$$
select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/calibration-lab',
 headers:=jsonb_build_object('Content-Type','application/json','x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')),
 body:='{}'::jsonb, timeout_milliseconds:=30000);$$);
