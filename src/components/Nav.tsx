import { PAGES, type PageId } from '../lib/router';
import { Logo } from './Logo';

/**
 * Section navigation.
 *
 * A <nav> of real links, not buttons: each page has a URL, so middle-click and
 * "open in new tab" behave, and the browser handles history for us.
 *
 * `aria-current="page"` marks the active item for assistive tech — the pink
 * bar alone would be colour-only.
 */
export function Nav({ page, onSignOut }: { page: PageId; onSignOut: () => void }) {
  return (
    <nav className="nav" aria-label="Sections">
      <div className="nav-brand">
        <Logo size={26} className="brand-logo" />
        <span>
          MATCH<span className="np">POD</span>
        </span>
      </div>

      <ul className="nav-list">
        {PAGES.map((p) => (
          <li key={p.id}>
            <a
              href={`#/${p.id}`}
              className={p.id === page ? 'nav-item on' : 'nav-item'}
              aria-current={p.id === page ? 'page' : undefined}
            >
              <span className="ni-label">{p.label}</span>
              <span className="ni-blurb">{p.blurb}</span>
            </a>
          </li>
        ))}
      </ul>

      <button className="btn nav-signout" onClick={onSignOut}>
        Sign out
      </button>
    </nav>
  );
}
