import { useEffect, useState } from 'react';

/**
 * Hash routing, in about fifteen lines.
 *
 * Deliberately not react-router. Two reasons, both practical rather than
 * ideological:
 *
 *  - Path routing (`/activity`) on static hosting needs a server rewrite so a
 *    refresh or a pasted link does not 404. Hostinger shared hosting means an
 *    .htaccess file that has to be uploaded separately from dist/ and is easy
 *    to forget. A hash never reaches the server, so `#/activity` just works.
 *  - A dependency for this would be ~20KB to replace a `hashchange` listener.
 *
 * Real URLs either way: bookmarkable, shareable, and the back button works.
 */
export const PAGES = [
  { id: 'overview',   label: 'Overview',   blurb: 'The daily glance' },
  { id: 'funnel',     label: 'Funnel',     blurb: 'Signup to onboarded' },
  { id: 'activity',   label: 'Activity',   blurb: 'Who comes back' },
  { id: 'engagement', label: 'Engagement', blurb: 'What they do' },
  { id: 'trends',     label: 'Trends',     blurb: 'Day by day' },
  { id: 'cohorts',    label: 'Cohorts',    blurb: 'Retention by signup week' },
  { id: 'waitlist',   label: 'Waitlist',   blurb: 'Cap and gate' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

const isPage = (v: string): v is PageId => PAGES.some((p) => p.id === v);

function current(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return isPage(raw) ? raw : 'overview';
}

export function useHashRoute(): [PageId, (id: PageId) => void] {
  const [page, setPage] = useState<PageId>(current);

  useEffect(() => {
    const onChange = () => setPage(current());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Assigning the hash rather than calling setPage keeps the URL the single
  // source of truth — otherwise a nav click and a back button can disagree.
  const go = (id: PageId) => { window.location.hash = `#/${id}`; };

  return [page, go];
}
