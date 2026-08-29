-- ── One place to read the product's numbers ─────────────────────────────────
--
-- Five read-only views so "how is the app doing" is a single query instead of
-- a hand-written join every time. Nothing here creates a table, writes a row,
-- or changes an existing object — dropping the whole file is a no-op.
--
-- WHAT ALREADY EXISTED, and is deliberately NOT duplicated here:
--   podder_stats      (034) signup → profile → onboarded counts, cap, gate
--   podder_dropoff    (035) which step abandoners stopped at
--   onboarding_funnel (041) per-step reached/completed/drop %, median seconds
--   podder_roster     (035) the founding-podder list
--   push_queue_health (030) notification backlog
-- Those answer onboarding. These answer everything after it: who comes back,
-- what they do, and how it trends.
--
-- ── HOW HONEST EACH NUMBER IS — read before quoting one ─────────────────────
--
-- ACTIVITY comes from profiles.last_seen, which hooks/usePresence.ts writes
-- when the app comes to the foreground, at most once per 5 minutes. So it
-- means "last opened the app", NOT "last did something". A user who opens the
-- app and immediately closes it counts as active. There is no session length
-- and no screen-level activity, because nothing records those.
--
-- last_seen DEFAULTS TO now() when the profile row is created, so someone who
-- signs up and never returns still has a last_seen. That is why
-- `never_returned` compares last_seen against created_at rather than trusting
-- last_seen alone.
--
-- RETENTION here is "of the people who signed up in week W, how many are still
-- active now" — current retention by cohort. It is NOT day-N retention.
-- True day-N retention is impossible from this schema: last_seen is a single
-- column that gets overwritten, so once a user is active on day 30 there is no
-- longer any record that they were or weren't active on day 7. Getting real
-- day-N curves needs a daily snapshot (a tiny rollup table written by a cron
-- job, or a 'session_started' analytics event). Worth adding only once the
-- current-retention number is actually being looked at every week.
--
-- ENGAGEMENT comes from the swipes/matches/messages tables directly, not from
-- analytics_events — that log only carries the three onboarding events, so it
-- cannot answer anything about in-app behaviour.
--
-- SEED PROFILES ARE EXCLUDED from every view, via the '5eed0000%' id sentinel
-- that both maintenance/seed_*.sql scripts use. Without this, ten demo
-- profiles in staging would sit in `dormant_30d_plus` forever and quietly make
-- every retention number look worse than it is. If a future seed script uses a
-- different id prefix, it will silently be counted as real users — keep the
-- sentinel or update mp_real_profiles.
--
-- ── BLAST RADIUS ────────────────────────────────────────────────────────────
-- None. Every view is security_invoker and revoked from public/anon/
-- authenticated, exactly like 034/035/041 — only the service role can read
-- them, so no shipped client is affected whether it is old or new. Safe to
-- apply at any time, in either project, independently of any app release.
--
-- Depends on: 001 (profiles/swipes/matches/messages), 019 (app_config,
-- waitlist_position), 041 (analytics_events).

begin;

-- ── 0. Base: real users only ────────────────────────────────────────────────
-- Every view below builds on this so the seed filter is written once. `select
-- *` is expanded at creation time, so a column added to profiles later will
-- not appear here until this view is recreated — which is the safe direction.
create or replace view public.mp_real_profiles
with (security_invoker = on) as
select *
  from public.profiles
 where id::text not like '5eed0000%';

-- ── 1. Activity and dormancy — the "who is still here" view ─────────────────
-- Buckets are cumulative on purpose (active_30d INCLUDES active_7d, which
-- includes active_24h) because that is how the numbers get quoted out loud.
-- The dormant_* buckets are the disjoint ones.
create or replace view public.mp_metrics_activity
with (security_invoker = on) as
select
  count(*)                                                          as profiles,
  count(*) filter (where is_onboarded is true)                      as onboarded,
  count(*) filter (where is_active is not true)                     as deactivated,

  count(*) filter (where last_seen > now() - interval '24 hours')   as active_24h,
  count(*) filter (where last_seen > now() - interval '7 days')     as active_7d,
  count(*) filter (where last_seen > now() - interval '30 days')    as active_30d,

  count(*) filter (where last_seen <= now() - interval '7 days'
                     and last_seen >  now() - interval '30 days')   as dormant_7_30d,
  count(*) filter (where last_seen <= now() - interval '30 days')   as dormant_30d_plus,

  -- last_seen is nullable (only a default, not NOT NULL). A null falls through
  -- every bucket above, so it is counted explicitly rather than silently
  -- making the buckets not add up to `profiles`. Expect 0; a non-zero value
  -- means rows were inserted bypassing the default.
  count(*) filter (where last_seen is null)                         as last_seen_unknown,

  -- Signed up, never came back a second day. created_at is bounded too, so
  -- someone who joined an hour ago is not counted as lost yet.
  count(*) filter (where last_seen < created_at + interval '1 day'
                     and created_at < now() - interval '1 day')     as never_returned,

  round(100.0 * count(*) filter (where last_seen > now() - interval '7 days')
        / nullif(count(*) filter (where is_onboarded is true), 0), 1)
                                                                    as active_7d_pct
from public.mp_real_profiles;

-- ── 2. Weekly signup cohorts — current retention, not day-N ─────────────────
create or replace view public.mp_metrics_cohorts
with (security_invoker = on) as
select
  date_trunc('week', created_at)::date                               as cohort_week,
  count(*)                                                           as signed_up,
  count(*) filter (where is_onboarded is true)                       as onboarded,
  round(100.0 * count(*) filter (where is_onboarded is true)
        / nullif(count(*), 0), 1)                                    as onboarded_pct,
  count(*) filter (where last_seen > now() - interval '7 days')      as active_last_7d,
  count(*) filter (where last_seen > now() - interval '30 days')     as active_last_30d,
  round(100.0 * count(*) filter (where last_seen > now() - interval '30 days')
        / nullif(count(*), 0), 1)                                    as still_active_pct
from public.mp_real_profiles
group by 1
order by 1 desc;

-- ── 3. Engagement — swipes, matches, conversations ──────────────────────────
-- Seeds are filtered on the ACTOR column (who swiped, who sent), not on the
-- target: a real user's swipe onto a demo profile is still a real swipe.
create or replace view public.mp_metrics_engagement
with (security_invoker = on) as
with s as (
  select sw.* from public.swipes sw
   where sw.swiper_id::text not like '5eed0000%'
), m as (
  select mt.* from public.matches mt
   where mt.user1_id::text not like '5eed0000%'
      or mt.user2_id::text not like '5eed0000%'
), g as (
  select ms.* from public.messages ms
   where ms.sender_id::text not like '5eed0000%'
)
select
  (select count(*) from s)                                           as swipes_total,
  (select count(*) from s where created_at > now() - interval '7 days')
                                                                     as swipes_7d,
  (select count(distinct swiper_id) from s
    where created_at > now() - interval '7 days')                    as swipers_7d,
  (select count(*) from s where action in ('like','super-like'))     as likes_total,
  (select count(*) from s where action = 'pass')                     as passes_total,
  (select round(100.0 * count(*) filter (where action in ('like','super-like'))
         / nullif(count(*), 0), 1) from s)                           as like_rate_pct,

  (select count(*) from m)                                           as matches_total,
  (select count(*) from m where created_at > now() - interval '7 days')
                                                                     as matches_7d,
  -- Of the likes sent, how many became a match. A match needs BOTH sides, so
  -- this is bounded well below 100% by construction — read it as a trend, not
  -- as a score out of 100.
  (select round(100.0 * (select count(*) from m)
         / nullif((select count(*) from s
                    where action in ('like','super-like')), 0), 1))  as match_rate_pct,

  (select count(*) from g)                                           as messages_total,
  (select count(*) from g where created_at > now() - interval '7 days')
                                                                     as messages_7d,
  (select count(distinct match_id) from g)                           as matches_with_message,
  -- The number that actually matters: a match where BOTH people spoke. A
  -- match nobody replies to is a vanity metric.
  (select count(*) from (
     select match_id from g group by match_id
      having count(distinct sender_id) >= 2
   ) t)                                                              as two_way_conversations,
  (select round(avg(c), 1) from (
     select count(*) as c from g group by match_id
   ) t)                                                              as avg_messages_per_chat;

-- ── 4. Daily time series — the one to chart ─────────────────────────────────
-- 90 days, one row per day, zero-filled by generate_series so a day with no
-- activity plots as 0 rather than vanishing and distorting the line.
create or replace view public.mp_metrics_daily
with (security_invoker = on) as
select
  d::date                                                            as day,
  (select count(*) from public.mp_real_profiles p
    where p.created_at >= d and p.created_at < d + interval '1 day') as signups,
  -- Onboardings come from the event log, not from profiles: is_onboarded has
  -- no timestamp of its own and updated_at moves on every profile edit.
  (select count(*) from public.analytics_events e
    where e.event = 'onboarding_completed'
      and e.created_at >= d and e.created_at < d + interval '1 day') as onboardings,
  (select count(distinct sw.swiper_id) from public.swipes sw
    where sw.swiper_id::text not like '5eed0000%'
      and sw.created_at >= d and sw.created_at < d + interval '1 day')
                                                                     as active_swipers,
  (select count(*) from public.swipes sw
    where sw.swiper_id::text not like '5eed0000%'
      and sw.created_at >= d and sw.created_at < d + interval '1 day')
                                                                     as swipes,
  (select count(*) from public.matches mt
    where (mt.user1_id::text not like '5eed0000%'
        or mt.user2_id::text not like '5eed0000%')
      and mt.created_at >= d and mt.created_at < d + interval '1 day')
                                                                     as matches,
  (select count(*) from public.messages ms
    where ms.sender_id::text not like '5eed0000%'
      and ms.created_at >= d and ms.created_at < d + interval '1 day')
                                                                     as messages
from generate_series(
       (now() - interval '89 days')::date::timestamptz,
       now()::date::timestamptz,
       interval '1 day'
     ) d
order by day;

-- ── 5. Overview — the single row the dashboard opens on ─────────────────────
create or replace view public.mp_metrics_overview
with (security_invoker = on) as
select
  -- Signed up but never even created a profile row is a real drop-off stage,
  -- so this counts auth.users, not profiles.
  (select count(*) from auth.users
    where id::text not like '5eed0000%')                             as signed_up,
  a.profiles                                                         as started_profile,
  a.onboarded,
  a.deactivated,

  a.active_24h,
  a.active_7d,
  a.active_30d,
  a.active_7d_pct,
  a.dormant_7_30d,
  a.dormant_30d_plus,
  a.never_returned,

  e.swipes_7d,
  e.swipers_7d,
  e.like_rate_pct,
  e.matches_total,
  e.match_rate_pct,
  e.messages_7d,
  e.two_way_conversations,

  (select count(*) from public.mp_real_profiles
    where waitlist_position is not null)                             as waitlisted,
  c.waitlist_cap                                                     as cap,
  greatest(c.waitlist_cap - a.onboarded, 0)                          as spots_left,
  c.launch_open                                                      as gate_open
from public.mp_metrics_activity a
cross join public.mp_metrics_engagement e
cross join public.app_config c
where c.id = 1;

-- ── Grants — service role only, same posture as 034/035/041 ─────────────────
-- These views expose whole-population counts and read auth.users; no app role
-- has any business selecting from them. Revoked rather than never-granted,
-- because Supabase's default privileges grant authenticated access to new
-- objects in public (the leak 044 had to clean up on analytics_events).
revoke all on public.mp_real_profiles     from public, anon, authenticated;
revoke all on public.mp_metrics_activity  from public, anon, authenticated;
revoke all on public.mp_metrics_cohorts   from public, anon, authenticated;
revoke all on public.mp_metrics_engagement from public, anon, authenticated;
revoke all on public.mp_metrics_daily     from public, anon, authenticated;
revoke all on public.mp_metrics_overview  from public, anon, authenticated;

commit;

-- ── Verify (read-only; run after applying) ──────────────────────────────────
-- 1. The dashboard row renders:
--      select * from public.mp_metrics_overview;
--
-- 2. No app role can read any of them — expect ZERO rows:
--      select table_name, grantee, privilege_type
--        from information_schema.role_table_grants
--       where table_schema = 'public'
--         and table_name like 'mp_metrics%'
--         and grantee in ('anon','authenticated','PUBLIC');
--
-- 3. Seeds really are excluded. In staging with seeds present, the first count
--    must be 10 (or however many were seeded) and the second must be 0:
--      select count(*) from public.profiles where id::text like '5eed0000%';
--      select count(*) from public.mp_real_profiles where id::text like '5eed0000%';
--
-- 4. The activity buckets account for everyone exactly once. Expect true, and
--    expect last_seen_unknown = 0:
--      select active_7d + dormant_7_30d + dormant_30d_plus + last_seen_unknown
--             = profiles
--        from public.mp_metrics_activity;
--
-- 5. The daily series is zero-filled, not sparse — expect exactly 90:
--      select count(*) from public.mp_metrics_daily;
--
-- 6. Sanity-check activity against a raw query; both must agree:
--      select count(*) from public.mp_real_profiles
--       where last_seen > now() - interval '7 days';
--      select active_7d from public.mp_metrics_activity;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   begin;
--     drop view if exists public.mp_metrics_overview;
--     drop view if exists public.mp_metrics_daily;
--     drop view if exists public.mp_metrics_engagement;
--     drop view if exists public.mp_metrics_cohorts;
--     drop view if exists public.mp_metrics_activity;
--     drop view if exists public.mp_real_profiles;
--   commit;
--   Nothing reads these but a human in the SQL editor, so dropping them is
--   safe at any time. Drop in this order — the later views depend on the
--   earlier ones.
