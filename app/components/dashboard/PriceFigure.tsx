/**
 * A labelled amount, optionally linking out to where the number came from. It sits in a
 * `FigureStrip`, which lines it up: centred in its column on a phone, right-aligned on a wide screen.
 */
export default function PriceFigure({
  label,
  value,
  tone,
  href,
  hint
}: {
  label: string
  value: string
  tone?: string
  href?: string
  /** What the amount is made of, in small type under it. */
  hint?: string
}) {
  const labelClass = 'text-[0.625rem] font-semibold tracking-[0.18em] text-site-mantle uppercase sm:text-xs sm:tracking-[0.22em]'
  const valueClass = `font-semibold tabular-nums tracking-[-0.03em] ${tone ?? 'text-site-gray-nurse'}`

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group -mx-2 -my-1.5 flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 smooth hover:bg-site-mid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-summer-green sm:min-w-16"
      >
        <p className={`${labelClass} transition-colors group-hover:text-site-gray-nurse`}>{label}</p>
        <span
          className={`${valueClass} underline decoration-site-mantle/40 underline-offset-2 transition-colors group-hover:text-site-gray-nurse group-hover:decoration-site-gray-nurse/70`}
        >
          {value}
        </span>
        {hint ? <span className="text-xs tabular-nums text-site-mantle">{hint}</span> : null}
      </a>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:min-w-16">
      <p className={labelClass}>{label}</p>
      <p className={valueClass}>{value}</p>
      {hint ? <p className="text-xs tabular-nums text-site-mantle">{hint}</p> : null}
    </div>
  )
}
