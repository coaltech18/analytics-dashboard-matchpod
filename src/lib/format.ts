const nf = new Intl.NumberFormat('en-IN');

export const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : nf.format(v);

export const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `${v}%`;

export const dayMonth = (d: string): string =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const shortDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

export const stamp = (): string => new Date().toISOString().slice(0, 10);

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
