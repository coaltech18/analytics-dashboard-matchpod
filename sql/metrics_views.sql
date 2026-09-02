-- ── One place to read the product's numbers ─────────────────────────────────
--
-- Six read-only views so "how is the app doing" is a single query instead of
-- a hand-written join every time. Nothing here creates a table, writes a row,
-- or changes an existing object — dropping the whole file is a no-op.
--
-- Five of the six are pure aggregates. The sixth, mp_metrics_users, is a
-- per-person roster and carries names — see section 6 before touching it.
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
-- The one thing that changes with mp_metrics_users is what a slipped grant
-- would cost: five aggregate views leak counts, that one leaks a named roster.
-- Re-check its revoke line, not just that the file applied cleanly.
--
-- Depends on: 001 (profiles/swipes/matches/messages), 019 (app_config,
-- waitlist_position), 041 (analytics_events).

begin;

-- ── 0a. Signup count ────────────────────────────────────────────────────────
-- auth.users is owned by supabase_auth_admin, and service_role has no SELECT on
-- it. Every view here is security_invoker, so the overview view inherited that
-- and failed with "permission denied for table users" while the other four
-- worked.
--
-- The blunt fix would be `grant select on auth.users to service_role`, which
-- hands that role every user's email, phone and metadata permanently, for one
-- integer. This does the opposite: a security definer function that returns
-- exactly the count and nothing else.
--
-- security definer runs as the function owner (postgres), so it can read
-- auth.users. `set search_path = ''` is mandatory hardening for a definer
-- function — without it a caller could put a malicious `auth` schema earlier on
-- the path and have this run against their own table. Every name below is
-- therefore fully qualified.
create or replace function public.mp_signup_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from auth.users where id::text not like '5eed0000%';
$$;

-- Same posture as the views: service role only.
--
-- The grant is NOT optional. Functions are EXECUTE-to-PUBLIC by default, and
-- every role is implicitly a member of PUBLIC — so revoking from PUBLIC also
-- takes it away from service_role, trading one permission error for another.
-- Revoke first, then grant back explicitly to the one role that should have it.
revoke all on function public.mp_signup_count() from public, anon, authenticated;
grant execute on function public.mp_signup_count() to service_role;

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
  -- Onboardings need the event log: is_onboarded has no timestamp of its own,
  -- and updated_at moves on every profile edit, so neither can date them.
  --
  -- This project has no analytics_events table (migration 041 was never
  -- applied here), so the series is NULL rather than 0. That distinction
  -- matters: 0 would plot as a flat line reading "nobody onboarded for 90
  -- days", which is false. NULL means "not recorded", and the dashboard hides
  -- the series instead of drawing it.
  --
  -- If 041 is ever applied, swap this line back to the real count:
  --   (select count(*) from public.analytics_events e
  --     where e.event = 'onboarding_completed'
  --       and e.created_at >= d and e.created_at < d + interval '1 day')
  -- Note it will only have history from the day the app starts writing events.
  null::bigint                                                       as onboardings,
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
  -- so this counts auth.users, not profiles. Via the definer function above:
  -- this view is security_invoker and the caller cannot read auth.users.
  public.mp_signup_count()                                           as signed_up,
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

-- ── 6. Per-person roster — the only view that is not an aggregate ───────────
-- Everything above answers "how is the app doing". This answers "who is this
-- person and what have they done", which is the question you actually have
-- when a name comes up in support or in a founding-podder conversation.
--
-- It carries NAMES, so it is the one view here that holds personal data. Same
-- lock as the rest — service role only, reached solely through the metrics
-- function's admin allowlist — but do not loosen that grant for this one, and
-- do not add email, phone or photo columns. A count leaking is embarrassing;
-- a contactable identity leaking is a different category of problem.
--
-- The name column is found rather than assumed: this file is deliberately
-- outside the app's migration chain (see the header), so it cannot see a
-- rename. If profiles has none of the candidates below, the view falls back to
-- a short id and says so — better than failing to create.
do $$
declare
  candidates text[] := array['name','full_name','display_name','first_name','username'];
  col text;
begin
  select c.column_name into col
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name   = 'profiles'
     and c.column_name  = any (candidates)
   order by array_position(candidates, c.column_name)
   limit 1;

  if col is null then
    raise notice 'mp_metrics_users: profiles has no name column (looked for %) — showing short ids instead', candidates;
  end if;

  -- Dropped, not replaced. `create or replace view` can only APPEND columns:
  -- adding age/city in the middle of the list fails with "cannot change name
  -- of view column". Nothing reads this view but the metrics function, and DDL
  -- is transactional here, so there is no window where it is missing.
  drop view if exists public.mp_metrics_users;

  -- ponytail: correlated counts, one pass per person. Fine to a few thousand
  -- profiles; if it ever drags, replace the four subqueries with grouped
  -- left joins.
  execute format($v$
    create view public.mp_metrics_users
    with (security_invoker = on) as
    select
      p.id,
      %s                                                       as name,
      -- Profile facts, chosen for "who is this person" and nothing more.
      -- bio, photos, avatar_url, referral_code and the preference columns are
      -- deliberately absent: this is a roster, not a copy of the profile.
      p.age,
      p.city,
      p.room_status,
      p.created_at                                             as joined,
      p.last_seen,
      p.is_onboarded,
      p.is_active,
      p.waitlist_position,
      (select count(*) from public.swipes s
        where s.swiper_id = p.id)                              as swipes,
      (select count(*) from public.swipes s
        where s.swiper_id = p.id
          and s.action in ('like','super-like'))               as likes,
      -- Both sides of a match count it, so the totals here sum to roughly
      -- twice mp_metrics_engagement.matches_total. That is correct per person.
      (select count(*) from public.matches m
        where m.user1_id = p.id or m.user2_id = p.id)          as matches,
      (select count(*) from public.messages g
        where g.sender_id = p.id)                              as messages
    from public.mp_real_profiles p
    order by p.last_seen desc nulls last
    limit 500
  $v$, coalesce('p.' || quote_ident(col), 'left(p.id::text, 8)'));
end $$;

-- ── Grants — service role only, same posture as 034/035/041 ─────────────────
-- These views expose whole-population counts, and reach auth.users only
-- through mp_signup_count() above; no app role
-- has any business selecting from them. Revoked rather than never-granted,
-- because Supabase's default privileges grant authenticated access to new
-- objects in public (the leak 044 had to clean up on analytics_events).
revoke all on public.mp_real_profiles     from public, anon, authenticated;
revoke all on public.mp_metrics_activity  from public, anon, authenticated;
revoke all on public.mp_metrics_cohorts   from public, anon, authenticated;
revoke all on public.mp_metrics_engagement from public, anon, authenticated;
revoke all on public.mp_metrics_daily     from public, anon, authenticated;
revoke all on public.mp_metrics_overview  from public, anon, authenticated;
revoke all on public.mp_metrics_users     from public, anon, authenticated;

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
-- 6. The roster found a real name column — the name must not look like a
--    truncated uuid, and there must be at most 500 rows:
--      select name, matches, messages from public.mp_metrics_users limit 5;
--      select count(*) from public.mp_metrics_users;
--
-- 7. Sanity-check activity against a raw query; both must agree:
--      select count(*) from public.mp_real_profiles
--       where last_seen > now() - interval '7 days';
--      select active_7d from public.mp_metrics_activity;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   begin;
--     drop view if exists public.mp_metrics_users;
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
