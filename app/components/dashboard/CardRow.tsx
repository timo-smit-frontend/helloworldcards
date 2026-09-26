import type { ReactNode } from 'react'
import Image from '~/components/elements/Image'
import Pokemon from '~/components/elements/Pokemon'

/**
 * The pieces every card list in the admin is built from — recently sold, price
 * suggestions, deals, the Vinted relist — so they read alike on every screen.
 *
 * On a phone a row is the photo with the card's name and details beside it, and the
 * figures in a panel of their own underneath, one column each, so no number is squeezed
 * next to a name. From `md` up (`xl` for the relist, which also carries a button) the
 * row lays out on one line with the figures right-aligned at its end.
 */
export type CardRowBreakpoint = 'md' | 'xl'

/** The row itself, the photo and text columns; a row adds its own wide-screen columns. */
export const CARD_ROW = 'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4'

const STRIP: Record<CardRowBreakpoint, string> = {
  md: 'col-span-full grid auto-cols-fr grid-flow-col gap-2 rounded-panel bg-site-gunmetal px-2 py-3 *:items-center *:text-center md:col-span-1 md:flex md:justify-end md:gap-8 md:rounded-none md:bg-transparent md:p-0 md:*:items-end md:*:text-right',
  xl: 'col-span-full grid auto-cols-fr grid-flow-col gap-2 rounded-panel bg-site-gunmetal px-2 py-3 *:items-center *:text-center xl:col-span-1 xl:flex xl:justify-end xl:gap-8 xl:rounded-none xl:bg-transparent xl:p-0 xl:*:items-end xl:*:text-right'
}

/** The row's figures (`PriceFigure`s): a panel under the card on a phone, the end of the line on a wide screen. */
export function FigureStrip({ children, breakpoint = 'md' }: { children: ReactNode; breakpoint?: CardRowBreakpoint }) {
  return <div className={STRIP[breakpoint]}>{children}</div>
}

/**
 * The slab photo at the start of a row. `tall` gives it more room on a wide screen, for a row with more lines beside it.
 * A card without a photo shows its placeholder Pokémon when it is given one, as on the shop.
 */
export function CardThumbnail({ src, tall = false, pokemonId }: { src: string | null; tall?: boolean; pokemonId?: number | null }) {
  return (
    <div className={`relative h-24 w-16 shrink-0 overflow-hidden rounded-md ${tall ? 'md:h-36 md:w-24' : ''}`}>
      {src ? (
        <Image
          src={src}
          alt=""
          title=""
          width={tall ? 192 : 128}
          height={tall ? 288 : 192}
          maxwidth={400}
          sizes={tall ? '(min-width: 768px) 96px, 64px' : '64px'}
          aria-hidden
          className="absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full rounded-md"
        />
      ) : pokemonId != null ? (
        <Pokemon variant="placeholder" id={pokemonId} className="absolute inset-0 size-full p-1" />
      ) : null}
    </div>
  )
}
