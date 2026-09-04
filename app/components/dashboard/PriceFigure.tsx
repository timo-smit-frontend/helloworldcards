/** A labelled amount, optionally linking out to where the number came from. */
export default function PriceFigure({ label, value, tone, href }: { label: string; value: string; tone?: string; href?: string }) {
  const valueClass = `font-semibold tabular-nums tracking-[-0.03em] ${tone ?? 'text-site-gray-nurse'}`

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group -mx-2 -my-1.5 flex min-w-16 flex-col items-end gap-1 rounded-md px-2 py-1.5 text-right smooth hover:bg-site-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-summer-green"
      >
        <p className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase transition-colors group-hover:text-site-gray-nurse">
          {label}
        </p>
        <span
          className={`${valueClass} underline decoration-site-mantle/40 underline-offset-2 transition-colors group-hover:text-site-gray-nurse group-hover:decoration-site-gray-nurse/70`}
        >
          {value}
        </span>
      </a>
    )
  }

  return (
    <div className="flex min-w-16 flex-col items-end gap-1 text-right">
      <p className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{label}</p>
      <p className={valueClass}>{value}</p>
    </div>
  )
}
