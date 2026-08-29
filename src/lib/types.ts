/** Shapes returned by the `metrics` edge function. Every field is nullable:
 *  a view that fails is reported in `errors` and its numbers arrive as null,
 *  so the page renders an em-dash rather than crashing. */

export type Overview = {
  signed_up: number | null;
  started_profile: number | null;
  onboarded: number | null;
  deactivated: number | null;
  active_24h: number | null;
  active_7d: number | null;
  active_30d: number | null;
  active_7d_pct: number | null;
  dormant_7_30d: number | null;
  dormant_30d_plus: number | null;
  never_returned: number | null;
  swipes_7d: number | null;
  swipers_7d: number | null;
  like_rate_pct: number | null;
  matches_total: number | null;
  match_rate_pct: number | null;
  messages_7d: number | null;
  two_way_conversations: number | null;
  waitlisted: number | null;
  cap: number | null;
  spots_left: number | null;
  gate_open: boolean | null;
};

export type Activity = { last_seen_unknown: number | null };

export type Engagement = {
  matches_7d: number | null;
  avg_messages_per_chat: number | null;
};

export type DailyRow = {
  day: string;
  signups: number | null;
  onboardings: number | null;
  active_swipers: number | null;
  swipes: number | null;
  matches: number | null;
  messages: number | null;
};

export type CohortRow = {
  cohort_week: string;
  signed_up: number | null;
  onboarded: number | null;
  onboarded_pct: number | null;
  active_last_7d: number | null;
  active_last_30d: number | null;
  still_active_pct: number | null;
};

export type MetricsPayload = {
  overview?: Overview;
  activity?: Activity;
  engagement?: Engagement;
  daily?: DailyRow[];
  cohorts?: CohortRow[];
  generatedAt: string;
  /** Present only when a view failed; view name -> postgres error. */
  errors?: Record<string, string>;
};

/** Numeric series the trend chart can plot. */
export type SeriesKey = Exclude<keyof DailyRow, 'day'>;

export const SERIES: { key: SeriesKey; label: string }[] = [
  { key: 'signups', label: 'Signups' },
  { key: 'onboardings', label: 'Onboardings' },
  { key: 'active_swipers', label: 'Active swipers' },
  { key: 'swipes', label: 'Swipes' },
  { key: 'matches', label: 'Matches' },
  { key: 'messages', label: 'Messages' },
];
