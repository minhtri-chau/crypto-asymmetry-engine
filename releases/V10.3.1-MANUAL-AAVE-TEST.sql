select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/price-expectation-validation',
 headers := jsonb_build_object('Content-Type','application/json','x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')),
 body := '{"symbol":"AAVE","advance":false}'::jsonb,
 timeout_milliseconds := 30000
);
-- Then:
-- select id,status_code,content,error_msg from net._http_response where id=<REQUEST_ID>;
