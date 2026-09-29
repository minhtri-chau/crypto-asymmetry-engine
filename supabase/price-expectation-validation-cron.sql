-- Run only AFTER the AAVE manual test succeeds.
do $$ declare j record; begin
 for j in select jobid from cron.job where jobname='price-expectation-validation'
 loop perform cron.unschedule(j.jobid); end loop;
end $$;
select cron.schedule('price-expectation-validation','25 * * * *',$$
select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/price-expectation-validation',
 headers := jsonb_build_object('Content-Type','application/json','x-monitor-secret',(select decrypted_secret from vault.decrypted_secrets where name='monitor_cron_secret')),
 body := '{}'::jsonb, timeout_milliseconds := 30000);$$);
