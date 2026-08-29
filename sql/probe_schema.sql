-- ── What does this project actually have? ───────────────────────────────────
--
-- metrics_views.sql was written against a database at migration 048. Run this
-- FIRST on any project you are about to create the views on: Postgres stops at
-- the first missing object, so without it you fix one error, re-run, and find
-- the next. This lists every dependency at once.
--
-- Everything must say true. Anything false tells you which migration that
-- project has not had applied.

select 'table: profiles'          as dependency, to_regclass('public.profiles')          is not null as present
union all select 'table: swipes',           to_regclass('public.swipes')           is not null
union all select 'table: matches',          to_regclass('public.matches')          is not null
union all select 'table: messages',         to_regclass('public.messages')         is not null
union all select 'table: app_config',       to_regclass('public.app_config')       is not null
union all select 'table: analytics_events (041)', to_regclass('public.analytics_events') is not null

union all select 'profiles.created_at',        exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='created_at')
union all select 'profiles.last_seen',         exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='last_seen')
union all select 'profiles.is_onboarded',      exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_onboarded')
union all select 'profiles.is_active',         exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_active')
union all select 'profiles.waitlist_position', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='waitlist_position')

union all select 'app_config.waitlist_cap',    exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_config' and column_name='waitlist_cap')
union all select 'app_config.launch_open',     exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_config' and column_name='launch_open')
union all select 'app_config row id=1',        exists (select 1 from public.app_config where id = 1)

union all select 'swipes.swiper_id',           exists (select 1 from information_schema.columns where table_schema='public' and table_name='swipes' and column_name='swiper_id')
union all select 'swipes.direction',           exists (select 1 from information_schema.columns where table_schema='public' and table_name='swipes' and column_name='direction')
union all select 'matches.user1_id',           exists (select 1 from information_schema.columns where table_schema='public' and table_name='matches' and column_name='user1_id')
union all select 'messages.match_id',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='match_id')
union all select 'messages.sender_id',         exists (select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sender_id')

order by present, dependency;
