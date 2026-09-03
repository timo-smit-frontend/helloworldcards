import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import DashboardChart, { PeriodToggle } from '~/components/dashboard/DashboardChart'
import BurgerMenu from '~/components/elements/BurgerMenu'
import { ChoiceSelect } from '~/components/elements/ChoiceSelect'
import Image from '~/components/elements/Image'
import Logo from '~/components/elements/Logo'
import SkipToMainContent from '~/components/elements/SkipToMainContent'
import type { Ledger, LedgerPeriod } from '~/database/ledger-types'
import type { CardmarketReport } from '~/services/cardmarket/scan'
import type { MarktplaatsDealsReport } from '~/services/marktplaats-deals/scan'
import { CMS_BLOCK_PREVIEWS, sortMediaLibrary } from '~/cms/block-previews'
import {
  CMS_BLOCK_LABELS,
  CMS_BLOCK_TYPES,
  type CmsBlock,
  type CmsBlockType,
  type CmsMedia,
  type CmsNavItem,
  type CmsPage,
  type CmsSettings,
  type R2UsageSnapshot
} from '~/cms/types'
import type { InventoryProduct } from '~/database/products'
import { formatShopPrice, parseListedPrice } from '~/services/price'
import { SITE_NAME, toAbsoluteUrl } from '~/seo/site'
import { AdminBlocksSkeleton, AdminFormSkeleton, AdminLoading, AdminTableSkeleton, remainingLoadingHold } from './AdminLoading'
import { adminJson } from './api'
import { AdminSaveFeedback, useSaveFeedback } from './save-feedback'
import { MAX_PRODUCT_IMAGES, removeMediaUrl, toggleMediaSelection } from './media-selection'
import { adminPrefix, adminTo } from './runtime'
import { DialogCloseButton } from './DialogClose'
import { UnsavedChangesProvider, useRequestLeave, useUnsavedDraft } from './UnsavedChanges'

type Status = 'loading' | 'login' | 'ready' | 'error'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/pages', label: 'Pages' },
  { to: '/media', label: 'Media' },
  { to: '/products', label: 'Products' },
  { to: '/events', label: 'Events' },
  { to: '/faqs', label: 'FAQs' },
  { to: '/settings', label: 'Settings' }
] as const

function fieldClass() {
  return 'field w-full'
}

function textareaClass(desktop = '') {
  return `field w-full h-40 ${desktop ? ` ${desktop}` : ''}`
}

function DateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input type="date" className={fieldClass()} value={value} onChange={(event) => onChange(event.target.value)} />
}

function AdminCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="field flex min-w-0 cursor-pointer items-center gap-3 hover:border-site-envy">
      <span className="relative size-6 shrink-0">
        <input
          type="checkbox"
          className="peer size-6 cursor-pointer appearance-none rounded-[0.4rem] border-2 border-site-mulled-wine bg-site-dark checked:border-site-envy checked:bg-site-envy focus-visible:border-site-envy"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-site-dark opacity-0 peer-checked:opacity-100">
          <MorphIcon icon={Check} size={14} strokeWidth={2.75} />
        </span>
      </span>
      {label}
    </label>
  )
}

function AdminField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-2 text-sm font-medium${className ? ` ${className}` : ''}`}>
      {label}
      {children}
    </label>
  )
}

function IconButton({
  label,
  icon,
  disabled,
  danger,
  onClick
}: {
  label: string
  icon: typeof ArrowUp
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex shrink-0 cursor-pointer items-center justify-center p-2.5 disabled:cursor-not-allowed disabled:opacity-30 sm:p-0 ${
        danger ? 'text-site-loss hover:text-site-loss' : 'text-site-mantle hover:text-site-gray-nurse'
      }`}
      onClick={onClick}
    >
      <MorphIcon icon={icon} size={18} strokeWidth={2.25} />
    </button>
  )
}

function isAdminNavCurrent(pathname: string, prefix: string, to: (typeof NAV)[number]['to']) {
  const href = adminTo(to)
  return to === '/' ? pathname === href || pathname === `${prefix}/` : pathname.startsWith(href)
}

function adminNavLinkClass(current: boolean, large?: boolean) {
  return `rounded-panel px-3 font-semibold ${large ? 'py-3.5 text-2xl' : 'py-2 text-sm'} ${
    current ? 'bg-site-gunmetal text-site-envy' : 'text-site-mantle hover:text-site-gray-nurse'
  }`
}

function AdminLogoLink({ className, onClick }: { className: string; onClick?: () => void }) {
  return (
    <Link to={adminTo('/')} className="shrink-0" onClick={onClick}>
      <span className="sr-only">{SITE_NAME}</span>
      <Logo className={className} />
    </Link>
  )
}

function AdminScreenHeader({ title, to, label, trashTo }: { title: string; to: string; label: string; trashTo?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="title-l">{title}</h1>
      <div className="flex items-center gap-4">
        {trashTo ? (
          <Link
            to={trashTo}
            aria-label="Trash"
            title="Trash"
            className="flex cursor-pointer items-center text-site-mantle hover:text-site-gray-nurse"
          >
            <MorphIcon icon={Trash2} size={20} strokeWidth={2.25} />
          </Link>
        ) : null}
        <Link to={to} className="button-green w-fit! shrink-0">
          {label}
        </Link>
      </div>
    </div>
  )
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-100 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-panel bg-site-gunmetal p-6 pr-14 shadow-card ring-1 ring-site-mulled-wine focus:outline-none">
          <DialogCloseButton />
          <DialogPrimitive.Title className="title-xs md:mt-8">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="content-s mt-3 text-site-mantle">{description}</DialogPrimitive.Description>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
            <button
              type="button"
              className="button-danger sm:w-fit"
              onClick={() => {
                onOpenChange(false)
                onConfirm()
              }}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              className="cursor-pointer text-sm font-semibold text-site-mantle sm:w-fit"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function mediaLabel(item: { title: string; filename: string; url: string }) {
  return item.title || item.filename || item.url.split('/').filter(Boolean).at(-1) || item.url
}

function useMediaLibrary(open: boolean) {
  const [items, setItems] = useState<CmsMedia[] | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setItems(null)
    void adminJson<{ media: CmsMedia[] }>('/media').then((result) => {
      if (!cancelled) {
        setItems(result.data?.media ?? [])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  return items
}

function mediaTileClass(selected: boolean) {
  return `relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-panel bg-site-dark ring-1 ${
    selected ? 'ring-site-envy' : 'ring-site-mulled-wine hover:ring-site-envy'
  }`
}

function mediaImageClass() {
  return 'box-border size-full object-contain p-1'
}

function MediaLibraryShell({
  open,
  title,
  description,
  items,
  onOpenChange,
  children,
  footer
}: {
  open: boolean
  title: string
  description: string
  items: CmsMedia[] | null
  onOpenChange: (open: boolean) => void
  children: (items: CmsMedia[]) => ReactNode
  footer?: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-100 flex max-h-[min(90dvh,40rem)] w-[calc(100%-2.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine focus:outline-none">
          <DialogCloseButton />
          <div className="px-5 py-4 pr-14">
            <DialogPrimitive.Title className="title-xs md:mt-8">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 pt-1 pb-5">
            {items == null ? (
              <p className="content-s text-site-mantle">Loading…</p>
            ) : items.length === 0 ? (
              <p className="content-s text-site-mantle">No media yet. Upload images in Media first.</p>
            ) : (
              children(items)
            )}
          </div>
          {footer}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function MediaPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  const items = useMediaLibrary(open)
  const current = items?.find((item) => item.url === value)

  function choose(url: string) {
    onChange(url)
    setOpen(false)
  }

  return (
    <>
      {value ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Change media"
            className="flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-panel bg-site-dark ring-1 ring-site-mulled-wine hover:ring-site-envy"
            onClick={() => setOpen(true)}
          >
            <Image src={value} alt="" width={96} height={96} maxwidth={192} className={mediaImageClass()} />
          </button>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="truncate text-sm text-site-mantle">{mediaLabel(current ?? { title: '', filename: '', url: value })}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="cursor-pointer text-sm font-semibold text-site-envy" onClick={() => setOpen(true)}>
                Change media
              </button>
              <button type="button" className="cursor-pointer text-sm font-semibold text-site-loss" onClick={() => onChange('')}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="button-quiet w-fit!" onClick={() => setOpen(true)}>
          Choose media
        </button>
      )}
      <MediaLibraryShell
        open={open}
        title="Choose media"
        description="Pick an image from the media library."
        items={items}
        onOpenChange={setOpen}
      >
        {(library) => (
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0.5 sm:grid-cols-4 md:grid-cols-5">
            {library.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={mediaLabel(item)}
                  aria-pressed={item.url === value}
                  className={mediaTileClass(item.url === value)}
                  onClick={() => choose(item.url)}
                >
                  <Image
                    src={item.url}
                    alt={item.alt || mediaLabel(item)}
                    width={160}
                    height={160}
                    maxwidth={200}
                    className={mediaImageClass()}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </MediaLibraryShell>
    </>
  )
}

function MediaImagesPicker({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const items = useMediaLibrary(open)
  const chosen = value.filter((src) => src.trim() !== '')

  function openLibrary() {
    setDraft(chosen)
    setOpen(true)
  }

  function confirm() {
    onChange(draft)
    setOpen(false)
  }

  return (
    <>
      {chosen.length === 0 ? (
        <button type="button" className="button-quiet w-fit!" onClick={openLibrary}>
          Choose images
        </button>
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4">
          {chosen.map((url) => (
            <li key={url} className="group relative">
              <button
                type="button"
                aria-label="Change images"
                className="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-panel bg-site-dark ring-1 ring-site-mulled-wine hover:ring-site-envy"
                onClick={openLibrary}
              >
                <Image src={url} alt="" width={160} height={160} maxwidth={200} className={mediaImageClass()} />
              </button>
              <button
                type="button"
                aria-label="Remove image"
                className="absolute top-1.5 right-1.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full bg-site-dark/85 text-site-gray-nurse opacity-0 ring-1 ring-site-mulled-wine pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-site-loss [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                onClick={() => onChange(removeMediaUrl(chosen, url))}
              >
                <MorphIcon icon={X} size={16} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <MediaLibraryShell
        open={open}
        title="Choose images"
        description="Select up to 8 images from the media library."
        items={items}
        onOpenChange={setOpen}
        footer={
          items != null && items.length > 0 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <p className="content-s text-site-mantle">
                {draft.length} / {MAX_PRODUCT_IMAGES}
              </p>
              <button type="button" className="button-green w-fit!" onClick={confirm}>
                Use images
              </button>
            </div>
          ) : null
        }
      >
        {(library) => (
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0.5 sm:grid-cols-4 md:grid-cols-5">
            {library.map((item) => {
              const selected = draft.includes(item.url)
              const atMax = !selected && draft.length >= MAX_PRODUCT_IMAGES
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={mediaLabel(item)}
                    aria-pressed={selected}
                    disabled={atMax}
                    className={`${mediaTileClass(selected)} disabled:cursor-not-allowed disabled:opacity-40`}
                    onClick={() => setDraft(toggleMediaSelection(draft, item.url))}
                  >
                    <Image
                      src={item.url}
                      alt={item.alt || mediaLabel(item)}
                      width={160}
                      height={160}
                      maxwidth={200}
                      className={mediaImageClass()}
                    />
                    {selected ? (
                      <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-site-envy text-site-dark">
                        <MorphIcon icon={Check} size={14} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </MediaLibraryShell>
    </>
  )
}

function BlockPreviewThumb({ type }: { type: CmsBlockType }) {
  const src = CMS_BLOCK_PREVIEWS[type]
  if (!src) return null
  return (
    <span className="block aspect-2/1 w-48 shrink-0 overflow-hidden rounded-panel bg-site-dark p-1 ring-1 ring-site-mulled-wine sm:w-40">
      <Image
        src={src}
        alt=""
        width={160}
        height={80}
        maxwidth={320}
        sizes="(min-width: 640px) 10rem, 12rem"
        className="size-full object-contain"
      />
    </span>
  )
}

function DeleteControl({
  singular,
  forever,
  icon,
  onConfirm
}: {
  singular: string
  forever?: boolean
  icon?: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {icon ? (
        <IconButton label={forever ? 'Delete forever' : `Delete ${singular}`} icon={Trash2} danger onClick={() => setOpen(true)} />
      ) : (
        <button type="button" className="cursor-pointer text-sm font-semibold text-site-loss" onClick={() => setOpen(true)}>
          {forever ? 'Delete forever' : `Delete ${singular}`}
        </button>
      )}
      <ConfirmDialog
        open={open}
        title={forever ? 'Delete forever' : `Delete ${singular}`}
        description={forever ? `Delete this ${singular} forever? This cannot be undone.` : `Move this ${singular} to trash?`}
        confirmLabel={forever ? 'Delete forever' : 'Move to trash'}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
      />
    </>
  )
}

function adminTableColumnPad(extra?: string) {
  return ['max-sm:pr-2 sm:pr-4', extra].filter(Boolean).join(' ')
}

function adminTableCellPad(extra?: string) {
  return ['py-3.5 max-sm:pr-2 sm:pr-4', extra].filter(Boolean).join(' ')
}

function adminTableCellTextClass(cellClassName?: string) {
  return ['text-sm text-site-mantle sm:wrap-break-word', cellClassName].filter(Boolean).join(' ')
}

function AdminTable({
  caption,
  columns,
  children,
  loading,
  tableClassName
}: {
  caption: string
  columns: Array<{ label: string; className?: string }>
  children: ReactNode
  loading?: boolean
  tableClassName?: string
}) {
  if (loading) {
    return <AdminTableSkeleton columns={columns.length} />
  }

  return (
    <div className="min-w-0 max-w-full [touch-action:pan-y]">
      <table
        className={`w-full max-w-full border-collapse text-left max-sm:[&_th:first-child]:pl-0 max-sm:[&_td:first-child]:pl-0 max-sm:[&_th:last-child]:pr-0 max-sm:[&_td:last-child]:pr-0 sm:[&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-4 sm:[&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-4 ${tableClassName ?? ''}`}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-site-mulled-wine">
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`py-3 text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase ${column.className ?? adminTableColumnPad()}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function adminRowClass() {
  return 'relative cursor-pointer border-b border-site-mulled-wine [touch-action:pan-y] [@media(hover:hover)]:hover:bg-site-gunmetal'
}

function AdminClickableRow({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <tr
      className={adminRowClass()}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        navigate(to)
      }}
    >
      {children}
    </tr>
  )
}

function AdminRowLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`relative z-1 font-semibold [touch-action:pan-y] ${className ?? ''}`}>
      {children}
    </Link>
  )
}

function productStatus(product: Pick<InventoryProduct, 'sold' | 'concept'>) {
  if (product.sold) return 'sold'
  if (product.concept) return 'concept'
  return 'published'
}

function AdminStickyBar({ children, end }: { children: ReactNode; end?: boolean }) {
  return (
    <div className="admin-sticky-bar">
      <div className={`flex items-center gap-4 ${end ? 'justify-end' : 'justify-between'}`}>{children}</div>
    </div>
  )
}

function AdminNavLinks({ onNavigate, large }: { onNavigate?: () => void; large?: boolean }) {
  const location = useLocation()
  const prefix = adminPrefix()

  return NAV.map((item) => {
    const href = adminTo(item.to)
    const current = isAdminNavCurrent(location.pathname, prefix, item.to)
    return (
      <Link key={item.to} to={href} className={adminNavLinkClass(current, large)} onClick={onNavigate}>
        {item.label}
      </Link>
    )
  })
}

function AdminMobileMenu({ onLogout, submitting }: { onLogout: () => void; submitting: boolean }) {
  const location = useLocation()
  const requestLeave = useRequestLeave()
  const [open, setOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) {
      setIconOpen(false)
      return
    }

    const frame = requestAnimationFrame(() => setIconOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="relative z-10 inline-flex size-11 items-center justify-center text-site-gray-nurse"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <BurgerMenu className="cursor-pointer" open={false} />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300" />
        <DialogPrimitive.Content
          aria-modal="true"
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-50 flex h-full flex-col bg-site-dark text-site-gray-nurse shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300"
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">CMS navigation</DialogPrimitive.Description>
          <div className="flex items-center justify-between border-b border-site-mulled-wine px-5 py-3">
            <AdminLogoLink className="h-12 w-auto" onClick={() => setOpen(false)} />
            <DialogPrimitive.Close className="inline-flex size-11 items-center justify-center text-site-gray-nurse" aria-label="Close menu">
              <BurgerMenu className="cursor-pointer" open={iconOpen} />
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="CMS" className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-3">
            <AdminNavLinks large onNavigate={() => setOpen(false)} />
            <button
              type="button"
              className="mt-auto cursor-pointer rounded-panel px-3 py-3.5 text-left text-2xl font-semibold text-site-mantle hover:text-site-gray-nurse"
              onClick={() => {
                setOpen(false)
                requestLeave(onLogout)
              }}
              disabled={submitting}
            >
              Sign out
            </button>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function AdminShell({ children, onLogout, submitting }: { children: ReactNode; onLogout: () => void; submitting: boolean }) {
  const requestLeave = useRequestLeave()

  return (
    <div className="admin-shell fixed inset-0 flex overflow-hidden bg-site-dark text-site-gray-nurse">
      <SkipToMainContent />
      <aside className="hidden h-full w-56 shrink-0 overflow-hidden border-r border-site-mulled-wine lg:flex lg:flex-col">
        <div className="border-b border-site-mulled-wine px-5 py-4">
          <AdminLogoLink className="h-14 w-auto" />
        </div>
        <nav aria-label="CMS" className="flex min-h-0 flex-1 flex-col gap-1 p-3">
          <AdminNavLinks />
          <button
            type="button"
            className="mt-auto cursor-pointer rounded-panel px-3 py-2 text-left text-sm font-semibold text-site-mantle hover:text-site-gray-nurse"
            onClick={() => requestLeave(onLogout)}
            disabled={submitting}
          >
            Sign out
          </button>
        </nav>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-site-mulled-wine lg:hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <AdminLogoLink className="h-12 w-auto" />
            <AdminMobileMenu onLogout={onLogout} submitting={submitting} />
          </div>
        </header>
        <main id="main" className="flex min-h-0 flex-1 flex-col overflow-hidden" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}

function Login({
  username,
  password,
  message,
  submitting,
  onUsername,
  onPassword,
  onSubmit
}: {
  username: string
  password: string
  message: string
  submitting: boolean
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-site-dark text-site-gray-nurse">
      <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-6 rounded-panel bg-site-gunmetal p-6 sm:p-8">
        <h1 className="title-l">Sign in</h1>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Username
          <input
            className={fieldClass()}
            value={username}
            autoComplete="username"
            onChange={(event) => onUsername(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Password
          <input
            className={fieldClass()}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => onPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="button-green cursor-pointer" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {message ? <p className="content-s text-site-loss">{message}</p> : null}
      </form>
    </div>
  )
}

function DashboardScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [period, setPeriod] = useState<LedgerPeriod>('all')
  const [report, setReport] = useState<CardmarketReport | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [dealsReport, setDealsReport] = useState<MarktplaatsDealsReport | null>(null)
  const [dealsScanning, setDealsScanning] = useState(false)
  const [dealsScanError, setDealsScanError] = useState<string | null>(null)

  useEffect(() => {
    void adminJson<Ledger>('/ledger').then((result) => {
      if (result.ok && result.data) {
        setLedger(result.data)
      }
    })
    if (import.meta.env.DEV) {
      void adminJson<{ report: CardmarketReport | null }>('/cardmarket/report').then((result) => {
        if (result.ok) {
          setReport(result.data?.report ?? null)
        }
      })
      void adminJson<{ report: MarktplaatsDealsReport | null }>('/marktplaats-deals/report').then((result) => {
        if (result.ok) {
          setDealsReport(result.data?.report ?? null)
        }
      })
    }
  }, [])

  if (!ledger) {
    return (
      <div className="admin-page">
        <p className="content-l text-site-mantle">Loading the stats…</p>
      </div>
    )
  }

  return (
    <div className="admin-page flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="title-l">The stats</h1>
          <p className="content-l mt-2 text-site-mantle">What you paid, what came back, and what is still listed.</p>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>
      {import.meta.env.DEV ? (
        <DashboardChart
          ledger={ledger}
          period={period}
          report={report}
          scanning={scanning}
          scanError={scanError}
          onScan={() => {
            setScanning(true)
            setScanError(null)
            void adminJson<{ report: CardmarketReport; error?: string }>('/cardmarket/scan', { method: 'POST' }).then((result) => {
              setScanning(false)
              const body = result.data
              if (!result.ok || !body?.report) {
                setScanError(body?.error ?? 'The Cardmarket scan could not be started. Try again.')
                return
              }
              setReport(body.report)
            })
          }}
          dealsReport={dealsReport}
          dealsScanning={dealsScanning}
          dealsScanError={dealsScanError}
          onScanDeals={() => {
            setDealsScanning(true)
            setDealsScanError(null)
            void adminJson<{ report: MarktplaatsDealsReport; error?: string }>('/marktplaats-deals/scan', { method: 'POST' }).then(
              (result) => {
                setDealsScanning(false)
                const body = result.data
                if (!result.ok || !body?.report) {
                  setDealsScanError(body?.error ?? 'The Marktplaats deals scan could not be started. Try again.')
                  return
                }
                setDealsReport(body.report)
              }
            )
          }}
        />
      ) : (
        <DashboardChart ledger={ledger} period={period} />
      )}
    </div>
  )
}

function PagesScreen() {
  const [pages, setPages] = useState<CmsPage[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void adminJson<{ pages: CmsPage[] }>('/pages')
      .then((result) => {
        if (result.data?.pages) {
          setPages(result.data.pages)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="admin-page flex flex-col gap-6">
      <AdminScreenHeader title="Pages" to={adminTo('/pages/new')} label="New page" trashTo={adminTo('/pages/trash')} />
      <AdminTable
        caption="Pages"
        loading={loading}
        columns={[
          { label: 'Title' },
          { label: 'Path', className: adminTableColumnPad('whitespace-nowrap') },
          { label: 'Status', className: 'whitespace-nowrap' }
        ]}
      >
        {pages.map((page) => (
          <AdminClickableRow key={page.id} to={adminTo(`/pages/${page.id}`)}>
            <td className={adminTableCellPad()}>
              <AdminRowLink to={adminTo(`/pages/${page.id}`)}>{page.title}</AdminRowLink>
            </td>
            <td className={adminTableCellPad('font-mono text-sm whitespace-nowrap text-site-mantle')}>{page.path}</td>
            <td className={adminTableCellPad('text-sm whitespace-nowrap text-site-mantle capitalize')}>{page.status}</td>
          </AdminClickableRow>
        ))}
      </AdminTable>
    </div>
  )
}

const emptyBlock = (type: CmsBlockType): CmsBlock => {
  const id = `block-${Date.now().toString(36)}`
  switch (type) {
    case 'banner_figcaption':
      return { id, type, title: '', description: '', image: '', alt: '', figcaption: '', link: {} }
    case 'content_text':
      return { id, type, title: '', description: '', sections: [] }
    case 'content_cta':
      return { id, type, title: '', description: '', image: '', link: {} }
    case 'content_products':
      return { id, type, title: '', description: '' }
    case 'content_agenda':
      return { id, type, title: '', description: '' }
    case 'content_faq':
      return { id, type, title: '', faqIds: [] }
    case 'content_about':
      return { id, type, title: '', description: '', people: [], peopleCaption: '' }
    case 'form_contact':
      return { id, type, title: '', description: '' }
  }
}

function PageEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [page, setPage] = useState<Omit<CmsPage, 'id'>>({
    path: '/',
    status: 'draft',
    title: '',
    seoTitle: '',
    seoDescription: '',
    seoImage: '',
    blocks: []
  })
  const { feedback, formBodyRef, showSuccess, showError, clearFeedback } = useSaveFeedback()
  const [ready, setReady] = useState(isNew)
  const [expandedBlocks, setExpandedBlocks] = useState<ReadonlySet<string>>(() => new Set())
  const { capture, allowLeave } = useUnsavedDraft(page, { captured: isNew, subject: 'this page' })
  const captureRef = useRef(capture)
  const addedBlockId = useRef<string | null>(null)
  captureRef.current = capture

  useEffect(() => {
    const blockId = addedBlockId.current
    if (!blockId) {
      return
    }
    addedBlockId.current = null
    document.getElementById(blockId)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    })
  }, [page.blocks])

  useEffect(() => {
    if (isNew) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    void adminJson<{ page: CmsPage }>(`/pages/${id}`)
      .then((result) => {
        if (cancelled || !result.data?.page) {
          return
        }
        const next = result.data.page
        const draft = { ...next, seoImage: next.seoImage ?? '' }
        setPage(draft)
        captureRef.current(draft)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  async function save(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    const result = await adminJson<{ page: CmsPage; error?: string }>(isNew ? '/pages' : `/pages/${id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(page)
    })
    if (!result.ok) {
      showError((result.data as { error?: string } | null)?.error || 'Could not save this page.')
      return
    }
    if (isNew && result.data?.page) {
      const next = result.data.page
      const draft = { ...next, seoImage: next.seoImage ?? '' }
      setPage(draft)
      capture(draft)
      allowLeave()
      navigate(adminTo(`/pages/${next.id}`))
      return
    }
    capture()
    showSuccess('Page saved.')
  }

  return (
    <form onSubmit={(event) => void save(event)} className="admin-form">
      <div ref={formBodyRef} className="admin-form-body flex flex-col gap-5">
        <h1 className="title-l">{isNew ? 'New page' : 'Edit page'}</h1>
        <AdminSaveFeedback feedback={feedback} />
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <h2 className="title-xs">Components</h2>
            <div className="flex flex-col gap-3">
              {!ready ? <AdminBlocksSkeleton /> : null}
              {ready
                ? page.blocks.map((block, index) => {
                    const collapsed = !expandedBlocks.has(block.id)
                    const fieldsId = `${block.id}-fields`
                    return (
                      <div
                        key={block.id}
                        id={block.id}
                        className="scroll-mt-4 overflow-hidden rounded-panel bg-site-gunmetal ring-1 ring-site-mulled-wine"
                      >
                        <div className="flex min-w-0 items-center bg-site-mid">
                          <button
                            type="button"
                            aria-expanded={!collapsed}
                            aria-controls={fieldsId}
                            aria-label={CMS_BLOCK_LABELS[block.type]}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-left [touch-action:pan-y] sm:px-4 sm:py-3"
                            onClick={() =>
                              setExpandedBlocks((current) => {
                                const next = new Set(current)
                                if (next.has(block.id)) {
                                  next.delete(block.id)
                                } else {
                                  next.add(block.id)
                                }
                                return next
                              })
                            }
                          >
                            <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-site-mantle sm:w-6">
                              {index + 1}
                            </span>
                            <BlockPreviewThumb type={block.type} />
                            <span className="title-base min-w-0 flex-1 truncate text-lg max-sm:hidden lg:text-xl">
                              {CMS_BLOCK_LABELS[block.type]}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-1 pr-2 sm:gap-2 sm:pr-4">
                            <IconButton
                              label="Move up"
                              icon={ArrowUp}
                              disabled={index === 0}
                              onClick={() => setPage({ ...page, blocks: move(page.blocks, index, -1) })}
                            />
                            <IconButton
                              label="Move down"
                              icon={ArrowDown}
                              disabled={index === page.blocks.length - 1}
                              onClick={() => setPage({ ...page, blocks: move(page.blocks, index, 1) })}
                            />
                            <IconButton
                              label="Remove"
                              icon={Trash2}
                              danger
                              onClick={() => setPage({ ...page, blocks: page.blocks.filter((_, item) => item !== index) })}
                            />
                          </div>
                        </div>
                        <div id={fieldsId} hidden={collapsed} className="p-4">
                          <BlockFields
                            block={block}
                            pagePath={page.path}
                            onChange={(next) =>
                              setPage({ ...page, blocks: page.blocks.map((item, itemIndex) => (itemIndex === index ? next : item)) })
                            }
                          />
                        </div>
                      </div>
                    )
                  })
                : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <h2 className="title-xs">Page settings</h2>
            <label className="text-sm font-medium">
              Title
              <input
                className={`${fieldClass()} mt-2`}
                value={page.title}
                onChange={(event) => setPage({ ...page, title: event.target.value })}
              />
            </label>
            <label className="text-sm font-medium">
              Path
              <input
                className={`${fieldClass()} mt-2`}
                value={page.path}
                onChange={(event) => setPage({ ...page, path: event.target.value })}
              />
            </label>
            <div>
              <label htmlFor="page-status" className="text-sm font-medium">
                Status
              </label>
              <ChoiceSelect
                id="page-status"
                className="mt-2"
                value={page.status}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' }
                ]}
                onChange={(status) => setPage({ ...page, status: status as CmsPage['status'] })}
              />
            </div>
            <label className="text-sm font-medium">
              SEO title
              <input
                className={`${fieldClass()} mt-2`}
                value={page.seoTitle}
                onChange={(event) => setPage({ ...page, seoTitle: event.target.value })}
              />
            </label>
            <label className="text-sm font-medium">
              SEO description
              <textarea
                className={`${textareaClass('sm:min-h-24')} mt-2`}
                value={page.seoDescription}
                onChange={(event) => setPage({ ...page, seoDescription: event.target.value })}
              />
            </label>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">SEO image</p>
              <MediaPicker value={page.seoImage ?? ''} onChange={(url) => setPage({ ...page, seoImage: url })} />
            </div>
          </div>
        </div>
      </div>
      <AdminStickyBar>
        <ChoiceSelect
          aria-label="Add a new component"
          plain
          value=""
          placeholder={
            <>
              <span className="sm:hidden">Add component</span>
              <span className="hidden sm:inline">Add a new component</span>
            </>
          }
          icon={Plus}
          options={CMS_BLOCK_TYPES.map((type) => ({
            value: type,
            label: CMS_BLOCK_LABELS[type],
            image: CMS_BLOCK_PREVIEWS[type]
          }))}
          onChange={(type) => {
            if (!type) return
            const next = emptyBlock(type as CmsBlockType)
            addedBlockId.current = next.id
            setExpandedBlocks((current) => new Set(current).add(next.id))
            setPage({ ...page, blocks: [...page.blocks, next] })
          }}
        />
        <div className="flex items-center gap-4">
          {!isNew ? (
            <DeleteControl
              singular="page"
              icon
              onConfirm={() => {
                void adminJson(`/pages/${id}`, { method: 'DELETE' }).then((result) => {
                  if (result.ok) {
                    allowLeave()
                    navigate(adminTo('/pages'))
                  }
                })
              }}
            />
          ) : null}
          <button type="submit" className="button-green cursor-pointer">
            Save page
          </button>
        </div>
      </AdminStickyBar>
    </form>
  )
}

function move<T>(items: T[], index: number, direction: number): T[] {
  const next = [...items]
  const target = index + direction
  if (target < 0 || target >= next.length) {
    return items
  }
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function BlockFields({ block, pagePath, onChange }: { block: CmsBlock; pagePath: string; onChange: (block: CmsBlock) => void }) {
  const patch = (partial: Record<string, unknown>) => onChange({ ...block, ...partial } as CmsBlock)
  const privacyPage = pagePath.replace(/\/+$/, '') === '/privacy'
  return (
    <div className="grid gap-3">
      {'title' in block ? (
        <AdminField label="Title">
          <input className={fieldClass()} value={block.title ?? ''} onChange={(event) => patch({ title: event.target.value })} />
        </AdminField>
      ) : null}
      {'description' in block ? (
        <AdminField label="Description">
          <textarea
            className={textareaClass('sm:min-h-24')}
            value={block.description ?? ''}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </AdminField>
      ) : null}
      {'image' in block ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Image</p>
          <MediaPicker value={block.image ?? ''} onChange={(url) => patch({ image: url })} />
        </div>
      ) : null}
      {block.type === 'banner_figcaption' || block.type === 'content_cta' || block.type === 'content_text' ? (
        <AdminField label="Link URL">
          <input
            className={fieldClass()}
            value={block.link?.url ?? ''}
            onChange={(event) => patch({ link: { ...block.link, url: event.target.value } })}
          />
        </AdminField>
      ) : null}
      {block.type === 'banner_figcaption' || block.type === 'content_cta' || block.type === 'content_text' ? (
        <AdminField label="Link title">
          <input
            className={fieldClass()}
            value={block.link?.title ?? ''}
            onChange={(event) => patch({ link: { ...block.link, title: event.target.value } })}
          />
        </AdminField>
      ) : null}
      {block.type === 'content_agenda' ? (
        <AdminField label="Event IDs">
          <input
            className={fieldClass()}
            value={block.eventIds?.join(',') ?? ''}
            onChange={(event) =>
              patch({
                eventIds: event.target.value
                  .split(',')
                  .map((value) => Number(value.trim()))
                  .filter(Boolean)
              })
            }
          />
        </AdminField>
      ) : null}
      {block.type === 'content_faq' ? (
        <AdminField label="FAQ IDs">
          <input
            className={fieldClass()}
            value={block.faqIds?.join(',') ?? ''}
            onChange={(event) =>
              patch({
                faqIds: event.target.value
                  .split(',')
                  .map((value) => Number(value.trim()))
                  .filter(Boolean)
              })
            }
          />
        </AdminField>
      ) : null}
      {block.type === 'content_text' && privacyPage ? (
        <AdminField label="Subsections">
          <textarea
            className={textareaClass('sm:min-h-32')}
            value={(block.sections ?? []).map((section) => `${section.title} | ${section.body}`).join('\n')}
            onChange={(event) =>
              patch({
                sections: event.target.value.split('\n').map((line) => {
                  const [title, ...rest] = line.split('|')
                  return { title: title.trim(), body: rest.join('|').trim() }
                })
              })
            }
          />
        </AdminField>
      ) : null}
      {block.type === 'content_about' ? (
        <AdminField label="People">
          <textarea
            className={textareaClass('sm:min-h-32')}
            value={JSON.stringify(block.people, null, 2)}
            onChange={(event) => {
              try {
                patch({ people: JSON.parse(event.target.value) })
              } catch {
                /* keep typing */
              }
            }}
          />
        </AdminField>
      ) : null}
    </div>
  )
}

function ProductsScreen() {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void adminJson<{ products: InventoryProduct[] }>('/products')
      .then((result) => {
        if (result.data?.products) setProducts(result.data.products)
      })
      .finally(() => setLoading(false))
  }, [])
  return (
    <div className="admin-page flex flex-col gap-6">
      <AdminScreenHeader title="Products" to={adminTo('/products/new')} label="New product" trashTo={adminTo('/products/trash')} />
      <AdminTable
        caption="Products"
        loading={loading}
        columns={[
          { label: 'Title' },
          { label: 'Price', className: adminTableColumnPad('whitespace-nowrap') },
          { label: 'Status', className: 'whitespace-nowrap' }
        ]}
      >
        {products.map((product) => (
          <AdminClickableRow key={product.id} to={adminTo(`/products/${product.id}`)}>
            <td className={adminTableCellPad()}>
              <AdminRowLink to={adminTo(`/products/${product.id}`)} className="line-clamp-1">
                {product.title}
              </AdminRowLink>
              {product.subtitle ? <p className="mt-1 line-clamp-1 text-sm text-site-mantle">{product.subtitle}</p> : null}
            </td>
            <td className={adminTableCellPad('text-sm whitespace-nowrap tabular-nums text-site-mantle')}>{product.price ?? '—'}</td>
            <td className={adminTableCellPad('text-sm whitespace-nowrap text-site-mantle capitalize')}>{productStatus(product)}</td>
          </AdminClickableRow>
        ))}
      </AdminTable>
    </div>
  )
}

function ProductEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [product, setProduct] = useState<Partial<InventoryProduct>>({ title: '', subtitle: '', description: '', images: [] })
  const productDraftRef = useRef(product)
  productDraftRef.current = product
  const { feedback, formBodyRef, showSuccess, showError, clearFeedback } = useSaveFeedback()
  const [ready, setReady] = useState(isNew)
  const { capture, allowLeave } = useUnsavedDraft(product, { captured: isNew, subject: 'this product' })
  const captureRef = useRef(capture)
  captureRef.current = capture

  useEffect(() => {
    if (isNew) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    void adminJson<{ product: InventoryProduct }>(`/products/${id}`)
      .then((result) => {
        if (cancelled || !result.data?.product) {
          return
        }
        setProduct(result.data.product)
        productDraftRef.current = result.data.product
        captureRef.current(result.data.product)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  async function save(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    const draft = productDraftRef.current
    const result = await adminJson<{ product: InventoryProduct; error?: string }>(isNew ? '/products' : `/products/${id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify({
        ...draft,
        pokemonId: draft.pokemonId ?? null,
        images: (draft.images ?? []).filter((src) => src.trim() !== '').slice(0, MAX_PRODUCT_IMAGES)
      })
    })
    if (!result.ok) {
      showError('Could not save this product.')
      return
    }
    if (isNew && result.data?.product) {
      setProduct(result.data.product)
      productDraftRef.current = result.data.product
      capture(result.data.product)
      allowLeave()
      navigate(adminTo(`/products/${result.data.product.id}`))
      return
    }
    if (result.data?.product) {
      setProduct(result.data.product)
      productDraftRef.current = result.data.product
      capture(result.data.product)
    } else {
      capture()
    }
    showSuccess('Product saved.')
  }

  function patchProduct(patch: Partial<InventoryProduct> | ((current: Partial<InventoryProduct>) => Partial<InventoryProduct>)) {
    setProduct((current) => {
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
      productDraftRef.current = next
      return next
    })
  }

  const set = (key: string, value: unknown) => patchProduct({ [key]: value })

  function setNumber(key: string, raw: string) {
    if (raw.trim() === '') {
      set(key, undefined)
      return
    }
    const value = Number(raw)
    set(key, Number.isFinite(value) ? value : undefined)
  }

  function setEuro(key: string, raw: string) {
    if (raw.replace(/€/g, '').trim() === '') {
      set(key, undefined)
      return
    }
    const value = parseListedPrice(raw)
    if (value != null) {
      set(key, value)
    }
  }

  const listingStatus = productStatus(product)

  if (!ready) {
    return (
      <div className="admin-page">
        <AdminFormSkeleton fields={8} />
      </div>
    )
  }

  return (
    <form onSubmit={(event) => void save(event)} className="admin-form">
      <div ref={formBodyRef} className="admin-form-body flex flex-col gap-8">
        <h1 className="title-l">{isNew ? 'New product' : 'Edit product'}</h1>
        <AdminSaveFeedback feedback={feedback} />
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-5">
              <h2 className="title-xs">General</h2>
              <AdminField label="Title">
                <input className={fieldClass()} value={product.title ?? ''} onChange={(event) => set('title', event.target.value)} />
              </AdminField>
              <AdminField label="Subtitle">
                <input className={fieldClass()} value={product.subtitle ?? ''} onChange={(event) => set('subtitle', event.target.value)} />
              </AdminField>
              <AdminField label="Description">
                <textarea
                  className={textareaClass('sm:h-36')}
                  value={product.description ?? ''}
                  onChange={(event) => set('description', event.target.value)}
                />
              </AdminField>
              <AdminField label="Pokédex number">
                <input
                  className={fieldClass()}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={product.pokemonId ?? ''}
                  onChange={(event) => setNumber('pokemonId', event.target.value)}
                />
              </AdminField>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Images</p>
                <MediaImagesPicker value={product.images ?? []} onChange={(images) => patchProduct({ images })} />
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <h2 className="title-xs">Card</h2>
              <div className="grid grid-cols-2 gap-5">
                <AdminField label="Year">
                  <input
                    className={fieldClass()}
                    type="number"
                    inputMode="numeric"
                    value={product.year ?? ''}
                    onChange={(event) => setNumber('year', event.target.value)}
                  />
                </AdminField>
                <div className="flex min-w-0 flex-col gap-2">
                  <label htmlFor="product-language" className="text-sm font-medium">
                    Language
                  </label>
                  <ChoiceSelect
                    id="product-language"
                    value={product.language ?? ''}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'english', label: 'English' },
                      { value: 'japanese', label: 'Japanese' }
                    ]}
                    onChange={(value) => set('language', value || undefined)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <label htmlFor="product-grader" className="text-sm font-medium">
                    Grader
                  </label>
                  <ChoiceSelect
                    id="product-grader"
                    value={product.grader ?? ''}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'psa', label: 'PSA' },
                      { value: 'beckett', label: 'Beckett' }
                    ]}
                    onChange={(value) => set('grader', value || undefined)}
                  />
                </div>
                <AdminField label="Grade">
                  <input
                    className={fieldClass()}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={10}
                    step={0.5}
                    value={product.grade ?? ''}
                    onChange={(event) => setNumber('grade', event.target.value)}
                  />
                </AdminField>
                <AdminField label="Cardmarket URL" className="col-span-2">
                  <input
                    className={fieldClass()}
                    type="url"
                    value={product.cardmarketUrl ?? ''}
                    onChange={(event) => set('cardmarketUrl', event.target.value || undefined)}
                  />
                </AdminField>
                <AdminCheck
                  label="Reverse holo"
                  checked={product.reverseHolo === true}
                  onChange={(checked) => set('reverseHolo', checked || undefined)}
                />
                <AdminCheck
                  label="First edition"
                  checked={product.firstEdition === true}
                  onChange={(checked) => set('firstEdition', checked || undefined)}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <h2 className="title-xs">Sale</h2>
            <div className="flex flex-col gap-2">
              <label htmlFor="product-status" className="text-sm font-medium">
                Status
              </label>
              <ChoiceSelect
                id="product-status"
                value={listingStatus}
                options={[
                  { value: 'concept', label: 'Concept' },
                  { value: 'published', label: 'Published' },
                  { value: 'sold', label: 'Sold' }
                ]}
                onChange={(status) =>
                  patchProduct((current) => ({
                    ...current,
                    concept: status === 'concept' ? true : undefined,
                    sold: status === 'sold' ? true : undefined
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <AdminField label="Cost">
                <input
                  className={fieldClass()}
                  inputMode="decimal"
                  value={product.cost != null ? formatShopPrice(product.cost) : ''}
                  onChange={(event) => setEuro('cost', event.target.value)}
                />
              </AdminField>
              <AdminField label="Price">
                <input
                  className={fieldClass()}
                  value={product.price ?? ''}
                  onChange={(event) => set('price', event.target.value || undefined)}
                />
              </AdminField>
            </div>
            <AdminField label="Acquired at">
              <DateInput value={product.acquiredAt ?? ''} onChange={(value) => set('acquiredAt', value || undefined)} />
            </AdminField>
            <AdminField label="Sold at">
              <DateInput value={product.soldAt ?? ''} onChange={(value) => set('soldAt', value || undefined)} />
            </AdminField>
            <AdminField label="Marktplaats URL">
              <input
                className={fieldClass()}
                type="url"
                value={product.marktplaatsUrl ?? ''}
                onChange={(event) => set('marktplaatsUrl', event.target.value || undefined)}
              />
            </AdminField>
            <AdminField label="Vinted URL">
              <input
                className={fieldClass()}
                type="url"
                value={product.vintedUrl ?? ''}
                onChange={(event) => set('vintedUrl', event.target.value || undefined)}
              />
            </AdminField>
          </div>
        </div>
      </div>
      <AdminStickyBar end>
        {!isNew ? (
          <DeleteControl
            singular="product"
            icon
            onConfirm={() => {
              void adminJson(`/products/${id}`, { method: 'DELETE' }).then((result) => {
                if (result.ok) {
                  allowLeave()
                  navigate(adminTo('/products'))
                }
              })
            }}
          />
        ) : null}
        <button type="submit" className="button-green cursor-pointer">
          Save product
        </button>
      </AdminStickyBar>
    </form>
  )
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${value} B`
}

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return String(value)
}

function R2UsageMeter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (value: number) => string }) {
  const ratio = Math.min(used / limit, 1)
  const tone = ratio >= 0.8 ? 'bg-site-loss' : ratio >= 0.5 ? 'bg-site-envy' : 'bg-site-mantle'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-xs text-site-mantle">
        <span>{label}</span>
        <span>
          {format(used)} / {format(limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-site-mulled-wine">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(ratio * 100, used > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  )
}

function MediaEditor({ item, onChange, onDelete }: { item: CmsMedia; onChange: (next: CmsMedia) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [alt, setAlt] = useState(item.alt)
  const [copied, setCopied] = useState(false)
  const publicUrl = toAbsoluteUrl(item.url)

  useEffect(() => {
    setTitle(item.title)
    setAlt(item.alt)
  }, [item.id, item.title, item.alt])

  async function saveCopy() {
    const nextTitle = title.trim()
    const nextAlt = alt.trim()
    if (nextTitle === item.title && nextAlt === item.alt) {
      return
    }
    const result = await adminJson<{ media: CmsMedia }>(`/media/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: nextTitle, alt: nextAlt })
    })
    if (result.data?.media) {
      onChange(result.data.media)
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col gap-4 md:mt-8">
      <label className="flex flex-col gap-1 text-xs font-semibold tracking-[0.18em] text-site-mantle uppercase">
        Title
        <input
          className={fieldClass()}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void saveCopy()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold tracking-[0.18em] text-site-mantle uppercase">
        Alt
        <textarea
          className={textareaClass('sm:min-h-28')}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          onBlur={() => void saveCopy()}
        />
      </label>
      <div className="mt-auto flex items-center gap-3">
        <DeleteControl singular="image" forever icon onConfirm={onDelete} />
        <button type="button" className="button-quiet" onClick={() => void copyUrl()}>
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
    </div>
  )
}

function MediaScreen() {
  const fileInput = useRef<HTMLInputElement>(null)
  const ignoreOutsideClick = useRef(false)
  const [media, setMedia] = useState<CmsMedia[]>([])
  const [r2, setR2] = useState<R2UsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = media.find((item) => item.id === selectedId) ?? null

  function openItem(id: number) {
    ignoreOutsideClick.current = true
    setSelectedId(id)
    window.setTimeout(() => {
      ignoreOutsideClick.current = false
    }, 250)
  }

  useEffect(() => {
    void adminJson<{ media: CmsMedia[]; r2: R2UsageSnapshot }>('/media')
      .then((result) => {
        if (result.data?.media) setMedia(result.data.media)
        if (result.data?.r2) setR2(result.data.r2)
      })
      .finally(() => setLoading(false))
  }, [])

  async function upload(file: File) {
    const body = new FormData()
    body.append('file', file)
    const result = await adminJson<{ media: CmsMedia; r2?: R2UsageSnapshot }>('/media', { method: 'POST', body })
    if (result.data?.media) {
      setMedia((current) => sortMediaLibrary([result.data!.media, ...current]))
      openItem(result.data.media.id)
    }
    void adminJson<{ r2: R2UsageSnapshot }>('/media').then((next) => {
      if (next.data?.r2) setR2(next.data.r2)
    })
  }

  const alert = r2?.warnings.some((warning) => warning.level === 'alert')
  const warn = r2?.warnings.length

  return (
    <div className="admin-page flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="title-l">Media</h1>
        <div>
          <button type="button" className="button-green cursor-pointer" onClick={() => fileInput.current?.click()}>
            Upload image
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload image"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
        </div>
      </div>
      {warn && r2 ? (
        <div className="flex max-w-xl flex-col gap-3 rounded-panel bg-site-gunmetal p-4 ring-1 ring-site-mulled-wine">
          <p className="text-sm font-semibold">R2 this month</p>
          <p className={`content-s ${alert ? 'text-site-loss' : 'text-site-envy'}`}>
            {alert
              ? 'You are close to the free limit. Uploads still work; Cloudflare may start billing if this keeps climbing.'
              : 'Usage is over half the free tier. Nothing is blocked.'}
          </p>
          <R2UsageMeter label="Storage" used={r2.storageBytes} limit={r2.limits.storageBytes} format={formatBytes} />
          <R2UsageMeter label="Class A (writes)" used={r2.classA} limit={r2.limits.classA} format={formatCount} />
          <R2UsageMeter label="Class B (origin reads)" used={r2.classB} limit={r2.limits.classB} format={formatCount} />
        </div>
      ) : null}
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 md:grid-cols-5">
        {loading
          ? Array.from({ length: 9 }, (_, index) => (
              <li
                key={index}
                className="aspect-square animate-pulse rounded-panel bg-site-mulled-wine motion-reduce:animate-none"
                aria-hidden={index > 0}
                {...(index === 0 ? { role: 'status', 'aria-label': 'Loading media' } : {})}
              />
            ))
          : null}
        {media.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-label={item.title || item.filename}
              className={`flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-panel bg-site-dark ring-1 smooth ${
                selectedId === item.id ? 'ring-site-envy' : 'ring-site-mulled-wine hover:ring-site-envy'
              }`}
              onClick={() => openItem(item.id)}
            >
              <Image
                src={item.url}
                alt={item.alt || item.title || item.filename}
                title={item.title || undefined}
                width={200}
                height={200}
                maxwidth={200}
                className={mediaImageClass()}
              />
            </button>
          </li>
        ))}
      </ul>
      <DialogPrimitive.Root
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          {selected ? (
            <DialogPrimitive.Content
              className="fixed top-1/2 left-1/2 z-100 grid max-h-[min(90dvh,56rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-panel bg-site-gunmetal ring-1 ring-site-mulled-wine outline-none md:grid-cols-[minmax(0,1.5fr)_20rem]"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onPointerDownOutside={(event) => {
                if (ignoreOutsideClick.current) event.preventDefault()
              }}
              onInteractOutside={(event) => {
                if (ignoreOutsideClick.current) event.preventDefault()
              }}
            >
              <DialogCloseButton />
              <DialogPrimitive.Title className="sr-only">{selected.title || selected.filename}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Edit title, alt text, and URL for this image.</DialogPrimitive.Description>
              <div className="flex min-h-64 items-center justify-center bg-site-dark p-4 md:min-h-[28rem] md:p-8">
                <Image
                  src={selected.url}
                  alt={selected.alt || selected.title || selected.filename}
                  title={selected.title || undefined}
                  width={900}
                  height={1200}
                  maxwidth={1600}
                  sizes="(min-width: 768px) 50vw, 90vw"
                  priority
                  className="max-h-[min(70dvh,40rem)] w-auto object-contain"
                />
              </div>
              <div className="flex flex-col p-5">
                <MediaEditor
                  item={selected}
                  onChange={(next) => setMedia((current) => current.map((row) => (row.id === next.id ? next : row)))}
                  onDelete={() => {
                    void adminJson(`/media/${selected.id}`, { method: 'DELETE' })
                    setMedia((current) => current.filter((row) => row.id !== selected.id))
                    setSelectedId(null)
                  }}
                />
              </div>
            </DialogPrimitive.Content>
          ) : null}
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}

type CollectionColumn = {
  key: string
  label: string
  className?: string
  cellClassName?: string
  value?: (item: Record<string, unknown>) => string
}

function CollectionScreen({
  title,
  path,
  collectionKey,
  newLabel,
  columns,
  tableClassName
}: {
  title: string
  path: string
  collectionKey: string
  newLabel: string
  columns: CollectionColumn[]
  tableClassName?: string
}) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    void adminJson<Record<string, Array<Record<string, unknown>>>>(path)
      .then((result) => {
        if (result.data?.[collectionKey]) setItems(result.data[collectionKey])
      })
      .finally(() => setLoading(false))
  }, [path, collectionKey])

  return (
    <div className="admin-page flex flex-col gap-6">
      <AdminScreenHeader title={title} to={adminTo(`${path}/new`)} label={newLabel} trashTo={adminTo(`${path}/trash`)} />
      <AdminTable
        caption={title}
        loading={loading}
        tableClassName={tableClassName}
        columns={columns.map((column) => ({ label: column.label, className: column.className }))}
      >
        {items.map((item) => (
          <AdminClickableRow key={String(item.id)} to={adminTo(`${path}/${item.id}`)}>
            {columns.map((column, index) => (
              <td key={column.key} className={adminTableCellPad(column.className)}>
                {index === 0 ? (
                  <AdminRowLink to={adminTo(`${path}/${item.id}`)} className={column.cellClassName}>
                    {String(item[column.key] ?? '')}
                  </AdminRowLink>
                ) : (
                  <span className={adminTableCellTextClass(column.cellClassName)}>{String(item[column.key] ?? '')}</span>
                )}
              </td>
            ))}
          </AdminClickableRow>
        ))}
      </AdminTable>
    </div>
  )
}

function CollectionEditor({
  singular,
  path,
  collectionKey,
  fields
}: {
  singular: string
  path: string
  collectionKey: string
  fields: Array<{ key: string; label: string; type?: 'text' | 'textarea' | 'date' }>
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [draft, setDraft] = useState<Record<string, string>>({})
  const { feedback, formBodyRef, showSuccess, showError, clearFeedback } = useSaveFeedback()
  const [ready, setReady] = useState(isNew)
  const { capture, allowLeave } = useUnsavedDraft(draft, { captured: isNew, subject: `this ${singular}` })
  const captureRef = useRef(capture)
  captureRef.current = capture

  useEffect(() => {
    if (isNew) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    void adminJson<Record<string, Array<Record<string, unknown>>>>(path)
      .then((result) => {
        if (cancelled) return
        const item = result.data?.[collectionKey]?.find((row) => String(row.id) === id)
        if (!item) return
        const next: Record<string, string> = {}
        for (const field of fields) {
          next[field.key] = String(item[field.key] ?? '')
        }
        setDraft(next)
        captureRef.current(next)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [collectionKey, fields, id, isNew, path])

  async function save(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    const result = await adminJson<Record<string, Record<string, unknown>>>(isNew ? path : `${path}/${id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(draft)
    })
    if (!result.ok) {
      showError(`Could not save this ${singular}.`)
      return
    }
    if (isNew) {
      const created = result.data ? Object.values(result.data)[0] : null
      if (created?.id) {
        capture()
        allowLeave()
        navigate(adminTo(`${path}/${created.id}`))
      }
      return
    }
    capture()
    showSuccess(`${singular.charAt(0).toUpperCase()}${singular.slice(1)} saved.`)
  }

  if (!ready) {
    return (
      <div className="admin-page">
        <AdminFormSkeleton fields={fields.length} />
      </div>
    )
  }

  return (
    <form onSubmit={(event) => void save(event)} className="admin-form">
      <div ref={formBodyRef} className="admin-form-body flex flex-col gap-4">
        <h1 className="title-l">
          {isNew ? 'New' : 'Edit'} {singular}
        </h1>
        <AdminSaveFeedback feedback={feedback} />
        {fields.map((field) => (
          <label key={field.key} className="flex min-w-0 flex-col gap-2 text-sm font-medium">
            {field.label}
            {field.type === 'textarea' ? (
              <textarea
                className={textareaClass('sm:min-h-32')}
                value={draft[field.key] ?? ''}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            ) : field.type === 'date' ? (
              <DateInput value={draft[field.key] ?? ''} onChange={(value) => setDraft({ ...draft, [field.key]: value })} />
            ) : (
              <input
                type={field.type ?? 'text'}
                className={fieldClass()}
                value={draft[field.key] ?? ''}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <AdminStickyBar end>
        {!isNew ? (
          <DeleteControl
            singular={singular}
            icon
            onConfirm={() => {
              void adminJson(`${path}/${id}`, { method: 'DELETE' }).then((result) => {
                if (result.ok) {
                  allowLeave()
                  navigate(adminTo(path))
                }
              })
            }}
          />
        ) : null}
        <button type="submit" className="button-green cursor-pointer">
          Save {singular}
        </button>
      </AdminStickyBar>
    </form>
  )
}

const EVENT_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'date', label: 'Date', type: 'date' as const },
  { key: 'location', label: 'Location' }
]

const FAQ_FIELDS = [
  { key: 'question', label: 'Question' },
  { key: 'answer', label: 'Answer', type: 'textarea' as const }
]

const EVENT_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'date', label: 'Date', className: adminTableColumnPad('whitespace-nowrap') },
  { key: 'location', label: 'Location' }
]

const FAQ_COLUMNS: CollectionColumn[] = [
  {
    key: 'question',
    label: 'Question',
    className: adminTableColumnPad('align-top max-sm:w-[40%] max-sm:max-w-0 max-sm:min-w-0 max-sm:overflow-hidden max-sm:!pr-4'),
    cellClassName: 'block max-sm:line-clamp-2 max-sm:overflow-hidden'
  },
  {
    key: 'answer',
    label: 'Answer',
    className: adminTableColumnPad('align-top max-sm:w-[60%] max-sm:max-w-0 max-sm:min-w-0 max-sm:overflow-hidden'),
    cellClassName: 'block max-sm:line-clamp-3 max-sm:overflow-hidden'
  }
]

function EventsScreen() {
  return <CollectionScreen title="Events" path="/events" collectionKey="events" newLabel="New event" columns={EVENT_COLUMNS} />
}

function FaqsScreen() {
  return (
    <CollectionScreen
      title="FAQs"
      path="/faqs"
      collectionKey="faqs"
      newLabel="New FAQ"
      columns={FAQ_COLUMNS}
      tableClassName="max-sm:table-fixed"
    />
  )
}

function TrashScreen({
  title,
  backLabel,
  backTo,
  path,
  collectionKey,
  singular,
  columns,
  tableClassName
}: {
  title: string
  backLabel: string
  backTo: string
  path: string
  collectionKey: string
  singular: string
  columns: CollectionColumn[]
  tableClassName?: string
}) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    void adminJson<Record<string, Array<Record<string, unknown>>>>(`${path}/trash`)
      .then((result) => {
        if (result.data?.[collectionKey]) setItems(result.data[collectionKey])
      })
      .finally(() => setLoading(false))
  }, [path, collectionKey])

  return (
    <div className="admin-page flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="title-l">{title}</h1>
        <Link to={backTo} className="cursor-pointer text-sm font-semibold text-site-mantle hover:text-site-gray-nurse">
          {backLabel}
        </Link>
      </div>
      <AdminTable
        caption={title}
        loading={loading}
        tableClassName={tableClassName}
        columns={[
          ...columns.map((column) => ({ label: column.label, className: column.className })),
          { label: 'Actions', className: 'w-0 text-right' }
        ]}
      >
        {items.length === 0 ? (
          <tr>
            <td className="py-6 text-sm text-site-mantle" colSpan={columns.length + 1}>
              Nothing in trash.
            </td>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={String(item.id)} className="border-b border-site-mulled-wine">
              {columns.map((column) => (
                <td key={column.key} className={adminTableCellPad(column.className)}>
                  <span className={adminTableCellTextClass(column.cellClassName)}>
                    {column.value ? column.value(item) : String(item[column.key] ?? '')}
                  </span>
                </td>
              ))}
              <td className={adminTableCellPad('max-sm:pl-0 sm:pl-4 text-right whitespace-nowrap')}>
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    className="cursor-pointer text-sm font-semibold"
                    onClick={() => {
                      void adminJson(`${path}/${item.id}/restore`, { method: 'POST' }).then((result) => {
                        if (result.ok) setItems((current) => current.filter((row) => row.id !== item.id))
                      })
                    }}
                  >
                    Restore
                  </button>
                  <DeleteControl
                    singular={singular}
                    forever
                    onConfirm={() => {
                      void adminJson(`${path}/${item.id}/permanent`, { method: 'DELETE' }).then((result) => {
                        if (result.ok) setItems((current) => current.filter((row) => row.id !== item.id))
                      })
                    }}
                  />
                </div>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
    </div>
  )
}

function PagesTrashScreen() {
  return (
    <TrashScreen
      title="Page trash"
      backLabel="Back to pages"
      backTo={adminTo('/pages')}
      path="/pages"
      collectionKey="pages"
      singular="page"
      columns={[
        { key: 'title', label: 'Title' },
        { key: 'path', label: 'Path', className: adminTableColumnPad('whitespace-nowrap') },
        { key: 'status', label: 'Status', className: 'whitespace-nowrap' }
      ]}
    />
  )
}

function ProductsTrashScreen() {
  return (
    <TrashScreen
      title="Product trash"
      backLabel="Back to products"
      backTo={adminTo('/products')}
      path="/products"
      collectionKey="products"
      singular="product"
      columns={[
        { key: 'title', label: 'Title', cellClassName: 'line-clamp-1 font-semibold' },
        { key: 'price', label: 'Price', className: adminTableColumnPad('whitespace-nowrap'), value: (item) => String(item.price ?? '—') },
        {
          key: 'status',
          label: 'Status',
          className: 'whitespace-nowrap',
          value: (item) => productStatus(item as unknown as InventoryProduct)
        }
      ]}
    />
  )
}

function EventsTrashScreen() {
  return (
    <TrashScreen
      title="Event trash"
      backLabel="Back to events"
      backTo={adminTo('/events')}
      path="/events"
      collectionKey="events"
      singular="event"
      columns={EVENT_COLUMNS}
    />
  )
}

function FaqsTrashScreen() {
  return (
    <TrashScreen
      title="FAQ trash"
      backLabel="Back to FAQs"
      backTo={adminTo('/faqs')}
      path="/faqs"
      collectionKey="faqs"
      singular="FAQ"
      columns={FAQ_COLUMNS}
      tableClassName="max-sm:table-fixed"
    />
  )
}

function EventEditor() {
  return <CollectionEditor singular="event" path="/events" collectionKey="events" fields={EVENT_FIELDS} />
}

function FaqEditor() {
  return <CollectionEditor singular="FAQ" path="/faqs" collectionKey="faqs" fields={FAQ_FIELDS} />
}

const NAV_LOCATIONS = ['header', 'footer'] as const

function sharedNav(items: CmsNavItem[]): CmsNavItem[] {
  const header = items.filter((item) => item.location === 'header')
  const source = header.length > 0 ? header : items.filter((item) => item.location === 'footer')
  const seen = new Set<string>()
  return source.filter((item) => {
    const key = `${item.href}\0${item.label}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function mirroredNav(items: CmsNavItem[]): Array<Omit<CmsNavItem, 'id'>> {
  return NAV_LOCATIONS.flatMap((location) =>
    items.map((item, index) => ({
      location,
      label: item.label,
      href: item.href,
      sort: index
    }))
  )
}

function SettingsScreen() {
  const [settings, setSettings] = useState<CmsSettings | null>(null)
  const [nav, setNav] = useState<CmsNavItem[]>([])
  const { feedback, formBodyRef, showSuccess, showError, clearFeedback } = useSaveFeedback()
  const draft = { settings, nav }
  const { capture } = useUnsavedDraft(draft, { subject: 'site settings' })
  const captureRef = useRef(capture)
  captureRef.current = capture

  useEffect(() => {
    let cancelled = false
    void adminJson<{ settings: CmsSettings; nav: CmsNavItem[] }>('/settings').then((result) => {
      if (cancelled || !result.data) {
        return
      }
      const nextNav = sharedNav(result.data.nav)
      setSettings(result.data.settings)
      setNav(nextNav)
      captureRef.current({ settings: result.data.settings, nav: nextNav })
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!settings) {
    return (
      <div className="admin-page">
        <AdminFormSkeleton fields={6} />
      </div>
    )
  }
  return (
    <form
      className="admin-form"
      onSubmit={(event) => {
        event.preventDefault()
        clearFeedback()
        void adminJson('/settings', { method: 'PUT', body: JSON.stringify({ ...settings, nav: mirroredNav(nav) }) }).then((result) => {
          if (result.ok) {
            capture()
            showSuccess('Settings saved.')
            return
          }
          showError('Could not save settings.')
        })
      }}
    >
      <div ref={formBodyRef} className="admin-form-body flex flex-col gap-8">
        <h1 className="title-l">Settings</h1>
        <AdminSaveFeedback feedback={feedback} />
        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          {(
            [
              ['siteDescription', 'Description'],
              ['siteImage', 'Default image'],
              ['siteImageAlt', 'Default image alt'],
              ['contactEmail', 'Email'],
              ['instagramUrl', 'Instagram'],
              ['marktplaatsUrl', 'Marktplaats'],
              ['notFoundTitle', '404 title'],
              ['notFoundDescription', '404 text'],
              ['notFoundCta', '404 button']
            ] as const
          ).map(([key, label]) =>
            key === 'siteImage' ? (
              <div key={key} className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-medium">{label}</p>
                <MediaPicker value={settings.siteImage} onChange={(url) => setSettings({ ...settings, siteImage: url })} />
              </div>
            ) : (
              <AdminField key={key} label={label} className={key === 'siteDescription' ? 'sm:col-span-2' : undefined}>
                {key === 'siteDescription' || key === 'siteImageAlt' ? (
                  <textarea
                    className={textareaClass('sm:h-24')}
                    value={settings[key]}
                    onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                  />
                ) : (
                  <input
                    className={fieldClass()}
                    value={settings[key]}
                    onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                  />
                )}
              </AdminField>
            )
          )}
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="title-xs">Navigation</h2>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-3 py-0 font-semibold text-site-mantle hover:text-site-gray-nurse"
              onClick={() => setNav([...nav, { id: 0, location: 'header', label: 'New link', href: '/', sort: nav.length }])}
            >
              Add link
              <MorphIcon icon={Plus} size={18} strokeWidth={2.25} />
            </button>
          </div>
          {nav.map((item, index) => (
            <div
              key={item.id || index}
              className="flex w-full items-stretch gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:contents">
                <input
                  className={fieldClass()}
                  value={item.label}
                  aria-label="Label"
                  onChange={(event) =>
                    setNav(nav.map((row, rowIndex) => (rowIndex === index ? { ...row, label: event.target.value } : row)))
                  }
                />
                <input
                  className={fieldClass()}
                  value={item.href}
                  aria-label="Link"
                  onChange={(event) =>
                    setNav(nav.map((row, rowIndex) => (rowIndex === index ? { ...row, href: event.target.value } : row)))
                  }
                />
              </div>
              <div className="flex shrink-0 self-center sm:self-auto">
                <div className="flex size-12 items-center justify-center rounded-button border-2 border-site-mulled-wine bg-site-dark sm:size-auto sm:rounded-none sm:border-0 sm:bg-transparent">
                  <IconButton label="Remove" icon={Trash2} danger onClick={() => setNav(nav.filter((_, rowIndex) => rowIndex !== index))} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <AdminStickyBar end>
        <button type="submit" className="button-green cursor-pointer">
          Save settings
        </button>
      </AdminStickyBar>
    </form>
  )
}

export default function AdminApp() {
  const [status, setStatus] = useState<Status>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function applySession(result: { ok: boolean; status: number }) {
    if (result.status === 401 || result.status === 503) {
      setStatus('login')
      if (result.status === 503) setMessage('Sign in is not available.')
      return
    }
    setStatus(result.ok ? 'ready' : 'error')
  }

  async function loadSession() {
    applySession(await adminJson('/ledger'))
  }

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    void (async () => {
      const result = await adminJson('/ledger')
      const remaining = remainingLoadingHold(startedAt)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      if (!cancelled) applySession(result)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    const result = await adminJson('/session', { method: 'POST', body: JSON.stringify({ username, password }) })
    setSubmitting(false)
    if (!result.ok) {
      setMessage(result.status === 503 ? 'Sign in is not available.' : 'Wrong username or password')
      setStatus('login')
      return
    }
    setPassword('')
    await loadSession()
  }

  async function handleLogout() {
    setSubmitting(true)
    await adminJson('/logout', { method: 'POST' })
    setStatus('login')
    setSubmitting(false)
  }

  if (status === 'loading') {
    return <AdminLoading />
  }

  if (status === 'login' || status === 'error') {
    return (
      <Login
        username={username}
        password={password}
        message={status === 'error' ? 'This page could not be loaded. Refresh and try again.' : message}
        submitting={submitting}
        onUsername={setUsername}
        onPassword={setPassword}
        onSubmit={(event) => void handleLogin(event)}
      />
    )
  }

  const routes = (
    <Routes>
      <Route index element={<DashboardScreen />} />
      <Route path="pages" element={<PagesScreen />} />
      <Route path="pages/" element={<PagesScreen />} />
      <Route path="pages/trash" element={<PagesTrashScreen />} />
      <Route path="pages/trash/" element={<PagesTrashScreen />} />
      <Route path="pages/:id" element={<PageEditor />} />
      <Route path="pages/:id/" element={<PageEditor />} />
      <Route path="media" element={<MediaScreen />} />
      <Route path="media/" element={<MediaScreen />} />
      <Route path="products" element={<ProductsScreen />} />
      <Route path="products/" element={<ProductsScreen />} />
      <Route path="products/trash" element={<ProductsTrashScreen />} />
      <Route path="products/trash/" element={<ProductsTrashScreen />} />
      <Route path="products/:id" element={<ProductEditor />} />
      <Route path="products/:id/" element={<ProductEditor />} />
      <Route path="events" element={<EventsScreen />} />
      <Route path="events/" element={<EventsScreen />} />
      <Route path="events/trash" element={<EventsTrashScreen />} />
      <Route path="events/trash/" element={<EventsTrashScreen />} />
      <Route path="events/:id" element={<EventEditor />} />
      <Route path="events/:id/" element={<EventEditor />} />
      <Route path="faqs" element={<FaqsScreen />} />
      <Route path="faqs/" element={<FaqsScreen />} />
      <Route path="faqs/trash" element={<FaqsTrashScreen />} />
      <Route path="faqs/trash/" element={<FaqsTrashScreen />} />
      <Route path="faqs/:id" element={<FaqEditor />} />
      <Route path="faqs/:id/" element={<FaqEditor />} />
      <Route path="settings" element={<SettingsScreen />} />
      <Route path="settings/" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to={adminTo('/')} replace />} />
    </Routes>
  )

  return (
    <UnsavedChangesProvider>
      <AdminShell onLogout={() => void handleLogout()} submitting={submitting}>
        {routes}
      </AdminShell>
    </UnsavedChangesProvider>
  )
}
