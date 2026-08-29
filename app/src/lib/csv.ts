import type { MetricsPayload } from './types';
import { download, stamp } from './format';

/** RFC 4180: quote every field, double any embedded quote. */
const cell = (v: unknown): string =>
  `"${String(v ?? '').replace(/"/g, '""')}"`;

const row = (cells: unknown[]): string => cells.map(cell).join(',');

/** Section as `key,value` pairs — one wide row per object is unreadable in Excel. */
function pairs(title: string, obj: Record<string, unknown> | undefined): string[] {
  if (!obj) return [];
  return ['', row([title]), row(['metric', 'value']),
    ...Object.entries(obj).map(([k, v]) => row([k, v]))];
}

function tableOf(title: string, rows: Record<string, unknown>[] | undefined): string[] {
  if (!rows?.length) return [];
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  return ['', row([title]), row(cols), ...rows.map((r) => row(cols.map((c) => r[c])))];
}

export function exportCsv(data: MetricsPayload): void {
  const lines = [
    row(['MatchPod metrics']),
    row(['generated', data.generatedAt]),
    ...pairs('Overview', data.overview as unknown as Record<string, unknown>),
    ...pairs('Activity', data.activity as unknown as Record<string, unknown>),
    ...pairs('Engagement', data.engagement as unknown as Record<string, unknown>),
    ...tableOf('Daily', data.daily as unknown as Record<string, unknown>[]),
    ...tableOf('Cohorts', data.cohorts as unknown as Record<string, unknown>[]),
  ];
  // The BOM is not decoration: without it Excel reads the file as ANSI and
  // mangles every non-ASCII character.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  download(blob, `matchpod-metrics-${stamp()}.csv`);
}
