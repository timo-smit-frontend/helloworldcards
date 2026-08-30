import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, X } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { CardLanguage } from '~/database/products'
import { formatShopPrice } from '~/services/price'
import { applyCatalogListingParams, catalogFiltersActive, DEFAULT_PRODUCT_SORT, type ProductSort } from '~/services/productCatalog'
import {
  livePriceFitsBetweenBounds,
  rangeAfterTrackClick,
  ratioAtPrice,
  thumbCenterStyle,
  type PriceRange
} from '~/services/productPriceFilter'
import { cn } from '~/services/utils'

type CatalogDraft = {
  language: CardLanguage | null
  sort: ProductSort
  range: PriceRange | null
}

const EMPTY_VALUE = '__empty__'
const paginationControlClass =
  'inline-flex h-11 items-center justify-center rounded-full text-sm font-medium smooth enabled:cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40'

function toSelectValue(value: string) {
  return value === '' ? EMPTY_VALUE : value
}

function fromSelectValue(value: string) {
  return value === EMPTY_VALUE ? '' : value
}

function draftFromApplied(language: CardLanguage | null, sort: ProductSort, range: PriceRange | null): CatalogDraft {
  return { language, sort, range }
}

function draftPriceActive(draft: CatalogDraft, bounds: PriceRange | null): boolean {
  return bounds != null && draft.range != null && (draft.range.min > bounds.min || draft.range.max < bounds.max)
}

function ProductChoiceFilter({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium text-site-gray-nurse">
        {label}
      </label>
      <Select.Root value={toSelectValue(value)} onValueChange={(next) => onChange(fromSelectValue(next))}>
        <Select.Trigger
          id={id}
          aria-labelledby={`${id}-label`}
          className="field flex h-11 cursor-pointer items-center justify-between gap-3 py-0 text-left hover:border-site-envy data-[state=open]:border-site-envy"
        >
          <Select.Value />
          <Select.Icon className="shrink-0 text-site-mantle">
            <MorphIcon icon={ChevronDown} size={18} strokeWidth={2.25} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            className={cn(
              'z-110 w-(--radix-select-trigger-width) overflow-hidden rounded-button border-2 border-site-mulled-wine bg-site-gunmetal shadow-card',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
            )}
          >
            <Select.Viewport className="p-1">
              {options.map((option) => (
                <Select.Item
                  key={option.value || EMPTY_VALUE}
                  value={toSelectValue(option.value)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] px-3 py-2.5 text-base text-site-gray-nurse outline-none select-none data-highlighted:bg-site-mid data-[state=checked]:text-site-summer-green"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="shrink-0 text-site-summer-green">
                    <MorphIcon icon={Check} size={16} strokeWidth={2.5} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}

function ProductPriceFilter({
  idPrefix = 'price',
  bounds,
  range,
  onChange
}: {
  idPrefix?: string
  bounds: PriceRange
  range: PriceRange
  onChange: (next: PriceRange) => void
}) {
  const [showMinLive, setShowMinLive] = useState(false)
  const [showMaxLive, setShowMaxLive] = useState(false)
  const labelsRef = useRef<HTMLDivElement>(null)
  const minBoundRef = useRef<HTMLSpanElement>(null)
  const maxBoundRef = useRef<HTMLSpanElement>(null)
  const minLiveRef = useRef<HTMLSpanElement>(null)
  const maxLiveRef = useRef<HTMLSpanElement>(null)
  const minRatio = ratioAtPrice(range.min, bounds)
  const maxRatio = ratioAtPrice(range.max, bounds)
  const minMoved = range.min !== bounds.min
  const maxMoved = range.max !== bounds.max

  useLayoutEffect(() => {
    const track = labelsRef.current
    const minBound = minBoundRef.current
    const maxBound = maxBoundRef.current

    if (track == null || minBound == null || maxBound == null) {
      setShowMinLive(false)
      setShowMaxLive(false)
      return
    }

    const trackWidth = track.getBoundingClientRect().width
    const minWidth = minBound.getBoundingClientRect().width
    const maxWidth = maxBound.getBoundingClientRect().width

    function fits(live: HTMLSpanElement | null, ratio: number, enabled: boolean) {
      if (!enabled || live == null) {
        return false
      }

      return livePriceFitsBetweenBounds({
        ratio,
        liveWidth: live.getBoundingClientRect().width,
        minWidth,
        maxWidth,
        trackWidth
      })
    }

    setShowMinLive(fits(minLiveRef.current, minRatio, minMoved))
    setShowMaxLive(fits(maxLiveRef.current, maxRatio, maxMoved))
  }, [maxMoved, maxRatio, minMoved, minRatio])

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    onChange(rangeAfterTrackClick((event.clientX - rect.left) / rect.width, range, bounds).range)
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <p id={`${idPrefix}-range-label`} className="text-sm font-medium text-site-gray-nurse">
        Price
      </p>

      <div>
        <div className="relative h-7 cursor-pointer" onPointerDown={handleTrackPointerDown}>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-site-gray-nurse" />
          <label className="sr-only" htmlFor={`${idPrefix}-min`}>
            Minimum price
          </label>
          <input
            id={`${idPrefix}-min`}
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={range.min}
            aria-valuetext={formatShopPrice(range.min)}
            aria-labelledby={`${idPrefix}-range-label`}
            className="price-range"
            onChange={(event) => {
              const nextMin = Number(event.target.value)
              onChange({ min: Math.min(nextMin, range.max), max: range.max })
            }}
          />
          <label className="sr-only" htmlFor={`${idPrefix}-max`}>
            Maximum price
          </label>
          <input
            id={`${idPrefix}-max`}
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={range.max}
            aria-valuetext={formatShopPrice(range.max)}
            aria-labelledby={`${idPrefix}-range-label`}
            className="price-range"
            onChange={(event) => {
              const nextMax = Number(event.target.value)
              onChange({ min: range.min, max: Math.max(nextMax, range.min) })
            }}
          />
        </div>

        <div ref={labelsRef} className="relative h-4">
          <span ref={minBoundRef} className="absolute left-0 text-xs tabular-nums text-site-mantle">
            {formatShopPrice(bounds.min)}
          </span>
          {minMoved && (
            <span
              ref={minLiveRef}
              className={cn(
                'absolute top-0 -translate-x-1/2 text-xs font-semibold tabular-nums text-site-summer-green',
                !showMinLive && 'invisible'
              )}
              style={thumbCenterStyle(minRatio)}
              aria-live="polite"
            >
              {formatShopPrice(range.min)}
            </span>
          )}
          {maxMoved && (
            <span
              ref={maxLiveRef}
              className={cn(
                'absolute top-0 -translate-x-1/2 text-xs font-semibold tabular-nums text-site-summer-green',
                !showMaxLive && 'invisible'
              )}
              style={thumbCenterStyle(maxRatio)}
              aria-live="polite"
            >
              {formatShopPrice(range.max)}
            </span>
          )}
          <span ref={maxBoundRef} className="absolute right-0 text-xs tabular-nums text-site-mantle">
            {formatShopPrice(bounds.max)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ProductCatalogFilterFields({
  idPrefix,
  bounds,
  range,
  language,
  sort,
  onRangeChange,
  onLanguageChange,
  onSortChange
}: {
  idPrefix: string
  bounds: PriceRange | null
  range: PriceRange | null
  language: CardLanguage | null
  sort: ProductSort
  onRangeChange: (next: PriceRange) => void
  onLanguageChange: (next: CardLanguage | null) => void
  onSortChange: (next: ProductSort) => void
}) {
  return (
    <>
      {bounds && range && bounds.min !== bounds.max && (
        <div className="min-w-0">
          <ProductPriceFilter idPrefix={`${idPrefix}-price`} bounds={bounds} range={range} onChange={onRangeChange} />
        </div>
      )}
      <div className="min-w-0">
        <ProductChoiceFilter
          id={`${idPrefix}-language`}
          label="Language"
          value={language ?? ''}
          options={[
            { value: '', label: 'Any' },
            { value: 'english', label: 'English' },
            { value: 'japanese', label: 'Japanese' }
          ]}
          onChange={(value) => onLanguageChange(value === '' ? null : (value as CardLanguage))}
        />
      </div>
      <div className="min-w-0">
        <ProductChoiceFilter
          id={`${idPrefix}-sort`}
          label="Order by"
          value={sort}
          options={[
            { value: 'title-asc', label: 'Alphabetical' },
            { value: 'age-asc', label: 'Oldest first' },
            { value: 'age-desc', label: 'Newest first' },
            { value: 'price-desc', label: 'Highest to lowest price' },
            { value: 'price-asc', label: 'Lowest to highest price' }
          ]}
          onChange={(value) => onSortChange(value as ProductSort)}
        />
      </div>
    </>
  )
}

export function ProductCatalogFilterSheet({
  bounds,
  range,
  language,
  sort,
  searchParams,
  onApply
}: {
  bounds: PriceRange | null
  range: PriceRange | null
  language: CardLanguage | null
  sort: ProductSort
  searchParams: URLSearchParams
  onApply: (next: URLSearchParams) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<CatalogDraft>(() => draftFromApplied(language, sort, range))
  const appliedPriceActive = bounds != null && range != null && (range.min > bounds.min || range.max < bounds.max)
  const appliedActive = catalogFiltersActive({
    language,
    sort,
    priceActive: appliedPriceActive
  })
  const appliedCount = [language != null, appliedPriceActive, sort !== DEFAULT_PRODUCT_SORT].filter(Boolean).length
  const draftActive = catalogFiltersActive({
    language: draft.language,
    sort: draft.sort,
    priceActive: draftPriceActive(draft, bounds)
  })

  useEffect(() => {
    if (!open) return
    setDraft(draftFromApplied(language, sort, range))
  }, [open, language, sort, range])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (media.matches) setOpen(false)
    }

    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  function applyDraft() {
    onApply(applyCatalogListingParams(searchParams, draft, bounds))
    setOpen(false)
  }

  function resetDraft() {
    setDraft({
      language: null,
      sort: DEFAULT_PRODUCT_SORT,
      range: bounds
    })
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-start px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden',
          open && 'hidden'
        )}
      >
        <DialogPrimitive.Trigger
          className="button-green pointer-events-auto w-full! cursor-pointer shadow-lg md:w-fit!"
          aria-label={appliedActive ? `Open filters, ${appliedCount} on` : 'Open filters'}
        >
          Filters
          {appliedActive && (
            <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-site-dark px-1.5 text-xs font-semibold text-site-gray-nurse">
              {appliedCount}
            </span>
          )}
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm lg:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300" />
        <DialogPrimitive.Content
          aria-modal="true"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement | null)?.closest('[data-radix-select-content]')) {
              event.preventDefault()
            }
          }}
          className="fixed inset-x-0 bottom-0 z-100 flex max-h-[min(40rem,90dvh)] flex-col rounded-t-panel bg-site-gunmetal text-site-gray-nurse shadow-lg ring-1 ring-site-mulled-wine lg:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-200 data-[state=open]:duration-300"
        >
          <div className="flex items-center justify-between gap-3 border-b border-site-mulled-wine px-5 py-4 sm:px-7">
            <DialogPrimitive.Title className="text-lg font-semibold">Filters</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Choose price, language, and order, then apply them together.
            </DialogPrimitive.Description>
            <div className="flex items-center gap-1">
              {draftActive && (
                <button type="button" className="cursor-pointer px-3 py-2 text-sm font-medium text-site-summer-green" onClick={resetDraft}>
                  Reset
                </button>
              )}
              <DialogPrimitive.Close
                className="inline-flex size-11 cursor-pointer items-center justify-center text-site-gray-nurse"
                aria-label="Close filters"
              >
                <MorphIcon icon={X} size={22} strokeWidth={2.25} />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto px-5 py-6 sm:px-7">
            <ProductCatalogFilterFields
              idPrefix="product-sheet"
              bounds={bounds}
              range={draft.range}
              language={draft.language}
              sort={draft.sort}
              onRangeChange={(next) => setDraft((current) => ({ ...current, range: next }))}
              onLanguageChange={(next) => setDraft((current) => ({ ...current, language: next }))}
              onSortChange={(next) => setDraft((current) => ({ ...current, sort: next }))}
            />
          </div>

          <div className="border-t border-site-mulled-wine px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7">
            <button type="button" className="button-green w-full! cursor-pointer" onClick={applyDraft}>
              Apply filters
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ProductCatalogPagination({
  page,
  totalPages,
  onPageChange
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) {
    return null
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <nav aria-label="Product pages" className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        className={cn(paginationControlClass, 'px-4 text-site-gray-nurse ring-1 ring-site-mulled-wine enabled:hover:ring-site-envy')}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {pages.map((number) => {
          const current = number === page
          return (
            <li key={number}>
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                aria-label={`Page ${number}`}
                className={cn(
                  paginationControlClass,
                  'min-w-11 px-3',
                  current ? 'bg-site-envy text-site-dark' : 'text-site-gray-nurse ring-1 ring-site-mulled-wine enabled:hover:ring-site-envy'
                )}
                onClick={() => onPageChange(number)}
              >
                {number}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className={cn(paginationControlClass, 'px-4 text-site-gray-nurse ring-1 ring-site-mulled-wine enabled:hover:ring-site-envy')}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}
