/**
 * Floppy Front's logo for the top-left corner: the helmeted head and pennant from the
 * favicon, and the name.
 */
export default function GameLogo() {
  return (
    <div className="ff-logo" aria-label="Floppy Front">
      <svg className="ff-logo__mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="38" r="20" fill="#f1c9a5" />
        <path d="M8 36a24 24 0 0 1 48 0z" fill="#4b5d32" />
        <rect x="6" y="33" width="52" height="6" rx="3" fill="#36452a" />
        <rect x="23" y="42" width="5" height="7" rx="1.5" fill="#222" />
        <rect x="36" y="42" width="5" height="7" rx="1.5" fill="#222" />
        <path d="M50 10l10 6-10 6z" fill="#ff8a1f" />
        <rect x="48" y="8" width="3" height="26" fill="#5a4028" />
      </svg>
      <span className="ff-logo__name">
        <span>Floppy</span>
        <span className="ff-logo__accent">Front</span>
      </span>
    </div>
  )
}
