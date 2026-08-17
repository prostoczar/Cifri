-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — putting the reminder sender on an hourly schedule (Chat 7)
--
-- The dashboard has a Cron UI, but it only appears once pg_cron is enabled, which is
-- why it is easy to go looking for and not find. This does the same job in SQL, and
-- is kept here rather than in migrations/ for one reason: it carries a secret. A
-- migration is committed, and a committed file is the wrong place for the value that
-- stops anyone on the internet notifying every subscriber Cifri has.
--
-- HOW TO RUN: replace the two placeholders below, paste the whole file into the
-- Supabase SQL editor, and run it. The final SELECT is the report.
--
-- WHAT IT TOUCHES: it enables two extensions and creates one scheduled job. It
-- writes no application data and reads none.
--
-- WHY HOURLY, when most players have one reminder a day: the function works out who
-- is due by comparing the current UTC hour against each subscriber's own published
-- hour. Running every hour is what lets every timezone be served by one schedule
-- instead of one per offset.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Replace these two ────────────────────────────────────────────────────────────
--   :cron_secret   the REMINDER_CRON_SECRET you set in Edge Function secrets
--   the URL below already points at this project and should not need changing
-- ─────────────────────────────────────────────────────────────────────────────────

-- pg_cron schedules the job; pg_net is what actually lets Postgres make an outbound
-- HTTP request. Enabling one without the other gets you a job that runs on time and
-- does nothing, which is a confusing thing to debug.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedule first so re-running this file updates the job rather than stacking a
-- second copy beside it — two jobs would mean two notifications an evening.
select cron.unschedule('cifri-send-reminders')
where exists (select 1 from cron.job where jobname = 'cifri-send-reminders');

select cron.schedule(
  'cifri-send-reminders',
  -- Every hour, on the hour.
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://bpiutjqpznlbtdveuybm.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- ↓↓↓ REPLACE THIS with your REMINDER_CRON_SECRET ↓↓↓
      'x-cron-secret', 'PASTE_YOUR_CRON_SECRET_HERE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── The report ───────────────────────────────────────────────────────────────────
-- One row, active, '0 * * * *'. If it is missing, the schedule call failed.
select
  jobname,
  schedule,
  active,
  case when active then 'PASS — scheduled hourly' else 'FAIL — job exists but is inactive' end as status
from cron.job
where jobname = 'cifri-send-reminders';

-- ── Afterwards ───────────────────────────────────────────────────────────────────
-- The last few runs, once an hour has passed. `status` is pg_cron's view of whether
-- the SQL ran, NOT whether OneSignal accepted anything — the function's own logs in
-- the Supabase dashboard are where a rejected send would show up.
--
--   select jobid, runid, status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'cifri-send-reminders')
--   order by start_time desc
--   limit 5;
--
-- To stop it entirely:
--
--   select cron.unschedule('cifri-send-reminders');
