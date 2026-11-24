import Link from 'next/link'

/** Local artwork derived from the supplied Calm Break logo, not a placeholder. */
export function CalmBrand({
  href = '/',
  label,
}: {
  href?: string
  label?: string
}) {
  return (
    <Link
      href={href}
      className="calm-brand"
      aria-label={label ? `Calm Break ${label}` : 'Calm Break home'}
    >
      <img src="/calm-break-mark-gold.png" alt="" width={56} height={56} />
      <span>
        <strong>CALM BREAK</strong>
        <small>{label || 'PAUSE · REFRESH · RECHARGE'}</small>
      </span>
    </Link>
  )
}

export function AuthBrandStory({
  operations = false,
}: {
  operations?: boolean
}) {
  return (
    <aside className="auth-brand-story">
      <CalmBrand
        href={operations ? '/operations' : '/'}
        label={operations ? 'OPERATIONS WORKSPACE' : undefined}
      />
      <div className="auth-story-copy">
        <div className="auth-logo-orbit">
          <img
            src="/calm-break-mark-gold.png"
            alt="Calm Break monogram from the supplied logo"
            width={200}
            height={200}
          />
        </div>
        <span className="auth-kicker">
          {operations
            ? 'THE PEOPLE BEHIND THE PAUSE'
            : 'A MOMENT, JUST FOR YOU'}
        </span>
        <h2>
          {operations ? (
            <>
              Exceptional service.
              <br />
              <em>Beautifully connected.</em>
            </>
          ) : (
            <>
              A little pause.
              <br />
              <em>A better day.</em>
            </>
          )}
        </h2>
        <p>
          {operations
            ? 'Your café, your shop, your team. One considered workspace to keep the day moving.'
            : 'Your favourite café moments and everyday essentials, brought together at Calm Break.'}
        </p>
      </div>
      <span className="auth-story-footer">
        PAUSE <i /> REFRESH <i /> RECHARGE
      </span>
    </aside>
  )
}
