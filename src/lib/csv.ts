import type { MetricsPayload } from './types';
import { download, stamp } from './format';

/**
 * The CSV is a document, not a dump.
 *
 * Every figure is listed under the dashboard section it belongs to, with the
 * label you see on the page rather than the column name in Postgres, and with
 * the caveat that makes it honest sitting in the row beside it. Someone
 * opening this file a month from now has no dashboard in front of them and no
 * way to ask what `two_way_conversations` meant.
 */

/** RFC 4180: quote every field, double any embedded quote. */
const cell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
const row = (cells: unknown[]): string => cells.map(cell).join(',');

/** Absent is not zero. A blank cell reads as zero to anyone skimming. */
const NOT_RECORDED = 'not recorded';

type Spec = {
  label: string;
  key: string;
  /** Appends a % so the unit survives outside the dashboard. */
  pct?: boolean;
  note?: string;
};

function value(v: unknown, spec: Spec): string {
  if (v === null || v === undefined) return NOT_RECORDED;
  if (typeof v === 'boolean') return v ? 'OPEN' : 'CLOSED';
  return spec.pct ? `${v}%` : String(v);
}

/* ── the document's shape ──────────────────────────────────────────────────
   Ordered on purpose, and grouped to match the pages. overview, activity and
   engagement are merged into one flat record first — their keys do not
   collide, and a reader does not care which view a number came from. */

const SECTIONS: { title: string; note?: string; rows: Spec[] }[] = [
  {
    title: 'Funnel',
    note: 'Each step is a subset of the one above it.',
    rows: [
      { label: 'Signed up', key: 'signed_up', note: 'auth accounts' },
      { label: 'Started profile', key: 'started_profile' },
      { label: 'Onboarded', key: 'onboarded' },
      { label: 'Deactivated', key: 'deactivated', note: 'still counted as signed up' },
    ],
  },
  {
    title: 'Activity and dormancy',
    note: '"Active" means opened the app, not used it — profiles.last_seen is written when the app comes to the foreground.',
    rows: [
      { label: 'Active 24h', key: 'active_24h' },
      { label: 'Active 7d', key: 'active_7d', note: 'includes Active 24h' },
      { label: 'Active 30d', key: 'active_30d', note: 'includes Active 7d' },
      { label: 'Active 7d as % of onboarded', key: 'active_7d_pct', pct: true },
      { label: 'Dormant 7-30d', key: 'dormant_7_30d', note: 'disjoint band' },
      { label: 'Dormant 30d+', key: 'dormant_30d_plus', note: 'disjoint band' },
      { label: 'Never returned', key: 'never_returned', note: 'signed up, no second day' },
      { label: 'Last seen unknown', key: 'last_seen_unknown', note: 'expect 0' },
    ],
  },
  {
    title: 'Engagement',
    rows: [
      { label: 'Swipes, last 7d', key: 'swipes_7d' },
      { label: 'Swipers, last 7d', key: 'swipers_7d', note: 'distinct people' },
      { label: 'Like rate', key: 'like_rate_pct', pct: true, note: 'of all swipes' },
      { label: 'Matches, all time', key: 'matches_total' },
      { label: 'Matches, last 7d', key: 'matches_7d' },
      {
        label: 'Match rate', key: 'match_rate_pct', pct: true,
        note: 'of likes sent; bounded well below 100% because a match needs both sides',
      },
      { label: 'Messages, last 7d', key: 'messages_7d' },
      {
        label: 'Two-way conversations', key: 'two_way_conversations',
        note: 'both people spoke — the one that tracks whether the product works',
      },
      { label: 'Messages per chat', key: 'avg_messages_per_chat', note: 'average' },
    ],
  },
  {
    title: 'Waitlist',
    rows: [
      { label: 'Waitlisted', key: 'waitlisted', note: 'holding a position' },
      { label: 'Cap', key: 'cap', note: 'onboarded limit, set in app_config' },
      { label: 'Spots left', key: 'spots_left', note: 'cap minus onboarded, floored at 0' },
      { label: 'Gate', key: 'gate_open' },
    ],
  },
];

/** Column names for the three tables, in the order they are written. */
const DAILY_COLS: Record<string, string> = {
  day: 'Day', signups: 'Signups', onboardings: 'Onboardings',
  active_swipers: 'Active swipers', swipes: 'Swipes', matches: 'Matches',
  messages: 'Messages',
};

const COHORT_COLS: Record<string, string> = {
  cohort_week: 'Cohort week', signed_up: 'Signed up', onboarded: 'Onboarded',
  onboarded_pct: 'Onboarded %', active_last_7d: 'Active last 7d',
  active_last_30d: 'Active last 30d', still_active_pct: 'Still active %',
};

const PEOPLE_COLS: Record<string, string> = {
  name: 'Name', age: 'Age', city: 'City', joined: 'Joined', last_seen: 'Last seen',
  swipes: 'Swipes', likes: 'Likes', matches: 'Matches', messages: 'Messages',
  room_status: 'Room status', is_onboarded: 'Onboarded', is_active: 'Active',
  waitlist_position: 'Waitlist position', id: 'Profile id',
};

/** Timestamp columns, trimmed to the minute. A raw `+00:00` ISO string is
 *  unreadable in a spreadsheet and Excel will not parse it as a date. */
const DATE_COLS = new Set(['joined', 'last_seen']);

const tableCell = (k: string, v: unknown): unknown =>
  DATE_COLS.has(k) && typeof v === 'string' ? v.slice(0, 16).replace('T', ' ') : (v ?? '');

/* ── writers ─────────────────────────────────────────────────────────────── */

function heading(title: string, note?: string): string[] {
  return note ? ['', row([title]), row([note])] : ['', row([title])];
}

function section(
  title: string, note: string | undefined, specs: Spec[], flat: Record<string, unknown>,
): string[] {
  return [
    ...heading(title, note),
    row(['Metric', 'Value', 'Notes']),
    ...specs.map((s) => row([s.label, value(flat[s.key], s), s.note ?? ''])),
  ];
}

/**
 * A table, with its all-null columns dropped and named in the note instead.
 * Ninety rows reading "not recorded" is noise; one line saying the database
 * does not record onboardings is the same fact, legibly.
 */
function table(
  title: string, note: string | undefined, cols: Record<string, string>,
  rows: Record<string, unknown>[] | undefined,
): string[] {
  if (!rows?.length) return [];

  const present = Object.keys(cols).filter((k) => k in (rows[0] ?? {}));
  const live = present.filter((k) => rows.some((r) => r[k] !== null && r[k] !== undefined));
  const empty = present.filter((k) => !live.includes(k)).map((k) => cols[k]);

  const notes = [note, empty.length ? `Not recorded by this database: ${empty.join(', ')}.` : '']
    .filter(Boolean).join(' ');

  return [
    ...heading(title, notes || undefined),
    row(live.map((k) => cols[k])),
    ...rows.map((r) => row(live.map((k) => tableCell(k, r[k])))),
  ];
}

export function exportCsv(data: MetricsPayload): void {
  // Keys across the three scalar views do not collide, and the reader does not
  // care which view a number came from — one flat record keeps SECTIONS simple.
  const flat: Record<string, unknown> = {
    ...(data.overview ?? {}), ...(data.activity ?? {}), ...(data.engagement ?? {}),
  };

  const spoken = new Set(SECTIONS.flatMap((s) => s.rows.map((r) => r.key)));
  // A metric added to a view but not to SECTIONS would otherwise vanish from
  // the export silently — the worst failure mode this repo has.
  const missed = Object.keys(flat).filter((k) => !spoken.has(k));

  const lines = [
    row(['MatchPod metrics']),
    row(['Generated', new Date(data.generatedAt).toLocaleString('en-IN')]),
    row(['Source', 'analytics.matchpod.in']),
    row(['Note', 'Seeded demo profiles are excluded from every figure.']),
    row(['Note', 'A blank cell is a genuine zero; "not recorded" means the database does not capture it.']),

    ...SECTIONS.flatMap((s) => section(s.title, s.note, s.rows, flat)),

    ...(missed.length
      ? [
          ...heading('Not yet in this report',
            'Present in the data but without a label — add it to SECTIONS in src/lib/csv.ts.'),
          row(['Column', 'Value']),
          ...missed.map((k) => row([k, flat[k] ?? NOT_RECORDED])),
        ]
      : []),

    ...table('Daily series', 'One row per day, ninety days, zero-filled.',
      DAILY_COLS, data.daily as unknown as Record<string, unknown>[]),

    ...table('Cohorts',
      'Current retention, not day-N: of the people who joined that week, how many opened the app in the last 30 days.',
      COHORT_COLS, data.cohorts as unknown as Record<string, unknown>[]),

    ...table('People',
      'One row per profile, 500 most recently seen. THIS SECTION NAMES INDIVIDUALS. Matches are counted from both sides, so this column does not sum to Matches above.',
      PEOPLE_COLS, data.users as unknown as Record<string, unknown>[]),

    ...(data.errors
      ? [
          ...heading('Views that failed', 'These numbers are missing from this file.'),
          row(['View', 'Error']),
          ...Object.entries(data.errors).map(([k, v]) => row([k, v])),
        ]
      : []),
  ];

  // The BOM is not decoration: without it Excel reads the file as ANSI and
  // mangles every non-ASCII character.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  download(blob, `matchpod-metrics-${stamp()}.csv`);
}
