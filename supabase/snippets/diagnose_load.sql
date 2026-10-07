-- Read-only diagnostic for "compute / disk IO high with no traffic".
-- Paste into Dashboard → SQL Editor and run. Returns one table.

with
biggest as (
  select n.nspname || '.' || c.relname as item,
         pg_size_pretty(pg_total_relation_size(c.oid)) as value,
         pg_total_relation_size(c.oid) as bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'm', 't')
  order by pg_total_relation_size(c.oid) desc
  limit 10
),
top_queries as (
  select left(regexp_replace(query, '\s+', ' ', 'g'), 120) as item,
         calls || ' calls, ' || round(total_exec_time / 1000) || 's total, '
           || shared_blks_read + shared_blks_written || ' blks io' as value,
         total_exec_time
  from extensions.pg_stat_statements
  order by total_exec_time desc
  limit 10
)
select '1 size' as section, item, value from (select * from biggest order by bytes desc) b
union all
select '2 cron jobs', jobname || ' [' || schedule || '] active=' || active, left(command, 80)
from cron.job
union all
select '3 cron runs', 'total rows in cron.job_run_details', count(*)::text
from cron.job_run_details
union all
select '3 cron runs', 'last 24h: ' || status, count(*)::text
  || ' runs, avg ' || round(avg(extract(epoch from end_time - start_time))::numeric, 2) || 's'
from cron.job_run_details
where start_time > now() - interval '24 hours'
group by status
union all
select '4 pg_net', 'net._http_response rows', count(*)::text from net._http_response
union all
select '4 pg_net', 'net.http_request_queue rows', count(*)::text from net.http_request_queue
union all
select '4 pg_net', 'last 24h responses: ' || coalesce(status_code::text, 'null') || coalesce(' ' || left(error_msg, 40), ''),
       count(*)::text
from net._http_response
where created > now() - interval '24 hours'
group by status_code, error_msg
union all
select '5 songs queue', 'link_status=' || link_status, count(*)::text
from songs group by link_status
union all
select '6 top queries', item, value from (select * from top_queries order by total_exec_time desc) q
union all
select '7 stats reset', 'pg_stat_statements since', coalesce(stats_reset::text, 'unknown')
from extensions.pg_stat_statements_info;
