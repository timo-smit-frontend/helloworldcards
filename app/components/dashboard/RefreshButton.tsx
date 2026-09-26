import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'

/** The round refresh button beside a screen's title, on the screens that read a marketplace. */
export default function RefreshButton({
  label,
  spinning,
  disabled,
  onClick
}: {
  label: string
  spinning: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mid hover:text-site-gray-nurse disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <MorphIcon icon={RotateCw} size={20} strokeWidth={2.25} className={spinning ? 'animate-spin' : undefined} />
    </button>
  )
}
