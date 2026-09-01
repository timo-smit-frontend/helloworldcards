import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { DialogCloseButton } from './DialogClose'
import { useNavigate } from 'react-router'
import { hasUnsavedChanges, serializeDraft, unsavedChangesCopy } from './unsaved-changes'

type UnsavedChangesController = {
  register: (dirty: boolean, subject: string) => void
  allowNavigation: () => void
  requestLeave: (onProceed: () => void) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesController | null>(null)

function useUnsavedChangesController() {
  const controller = useContext(UnsavedChangesContext)
  if (!controller) {
    throw new Error('Unsaved changes must be used inside the admin shell.')
  }
  return controller
}

export function useRequestLeave() {
  return useUnsavedChangesController().requestLeave
}

export function useUnsavedDraft<T>(draft: T, options: { captured?: boolean; subject: string }) {
  const { register, allowNavigation } = useUnsavedChangesController()
  const [baseline, setBaseline] = useState<string | null>(() => (options.captured ? serializeDraft(draft) : null))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const dirty = hasUnsavedChanges(baseline, draft)

  useEffect(() => {
    register(dirty, options.subject)
    return () => register(false, options.subject)
  }, [dirty, options.subject, register])

  const capture = useCallback((value?: T) => {
    setBaseline(serializeDraft(value ?? draftRef.current))
  }, [])

  const allowLeave = useCallback(() => {
    allowNavigation()
    setBaseline(serializeDraft(draftRef.current))
  }, [allowNavigation])

  return { capture, allowLeave }
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const [subject, setSubject] = useState('this page')
  const [open, setOpen] = useState(false)
  const dirtyRef = useRef(false)
  const pendingRef = useRef<(() => void) | null>(null)
  const pendingHrefRef = useRef<string | null>(null)

  const register = useCallback((nextDirty: boolean, nextSubject: string) => {
    dirtyRef.current = nextDirty
    setDirty(nextDirty)
    setSubject(nextSubject)
  }, [])

  const allowNavigation = useCallback(() => {
    dirtyRef.current = false
    setDirty(false)
    setOpen(false)
  }, [])

  const requestLeave = useCallback((onProceed: () => void) => {
    if (!dirtyRef.current) {
      onProceed()
      return
    }
    pendingHrefRef.current = null
    pendingRef.current = onProceed
    setOpen(true)
  }, [])

  const stay = () => {
    pendingRef.current = null
    pendingHrefRef.current = null
    setOpen(false)
  }

  const leave = () => {
    const href = pendingHrefRef.current
    const action = pendingRef.current
    pendingHrefRef.current = null
    pendingRef.current = null
    dirtyRef.current = false
    setDirty(false)
    setOpen(false)
    if (href) {
      navigate(href)
    }
    action?.()
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || isModifiedClick(event)) {
        return
      }
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return
      }
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) {
        return
      }
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      pendingRef.current = null
      pendingHrefRef.current = `${url.pathname}${url.search}${url.hash}`
      setOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!dirty) {
      return
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const copy = unsavedChangesCopy(subject)
  const controller = useMemo<UnsavedChangesController>(
    () => ({ register, allowNavigation, requestLeave }),
    [allowNavigation, register, requestLeave]
  )

  return (
    <UnsavedChangesContext.Provider value={controller}>
      {children}
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            stay()
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-100 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-panel bg-site-gunmetal p-6 pr-14 shadow-card ring-1 ring-site-mulled-wine focus:outline-none">
            <DialogCloseButton />
            <DialogPrimitive.Title className="title-xs md:mt-8">{copy.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="content-s mt-3 text-site-mantle">{copy.description}</DialogPrimitive.Description>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
              <button type="button" className="button-green sm:w-fit" onClick={stay}>
                {copy.stay}
              </button>
              <button type="button" className="button-danger sm:w-fit" onClick={leave}>
                {copy.leave}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </UnsavedChangesContext.Provider>
  )
}
