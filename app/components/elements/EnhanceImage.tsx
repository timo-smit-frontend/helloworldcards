import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { type Dispatch, type SetStateAction } from 'react'
import Image from '~/components/elements/Image'

export type EnhanceImageController = {
  toggler: boolean
  slide: number
}

export default function EnhanceImage({
  controller,
  setController,
  sources,
  alt = ''
}: {
  controller: EnhanceImageController
  setController: Dispatch<SetStateAction<EnhanceImageController>>
  sources: string[]
  alt?: string
}) {
  const src = sources[controller.slide - 1]
  const length = sources.length

  function close() {
    setController((prev) => ({ ...prev, toggler: false }))
  }

  return (
    <DialogPrimitive.Root open={controller.toggler} onOpenChange={(open) => setController((prev) => ({ ...prev, toggler: open }))}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 cursor-pointer bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-enhance]')) return
            close()
          }}
          className="fixed inset-0 z-100 flex cursor-pointer items-center justify-center"
        >
          <DialogPrimitive.Title className="sr-only">{alt || 'Enlarged image'}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Image {controller.slide} of {length}
          </DialogPrimitive.Description>
          <div data-enhance className="flex max-h-full max-w-full flex-col items-center gap-5 px-5">
            {src && (
              <Image
                className="h-auto max-h-[calc(100svh-11rem)] w-auto max-w-full cursor-default object-contain"
                src={src}
                alt={alt}
                width={1200}
                height={1600}
              />
            )}
            <div role="toolbar" className="flex items-center gap-1 rounded-full bg-site-envy px-2 py-1.5 text-site-dark shadow-card">
              {length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous slide"
                    disabled={controller.slide <= 1}
                    className="flex size-11 items-center justify-center rounded-full transition-colors duration-200 hover:bg-site-dark/10 disabled:pointer-events-none disabled:opacity-40 [&:not([disabled])]:cursor-pointer"
                    onClick={() => setController((prev) => ({ ...prev, slide: prev.slide - 1 }))}
                  >
                    <MorphIcon icon={ChevronLeft} size={22} strokeWidth={2.25} />
                  </button>
                  <span className="min-w-14 text-center text-sm font-semibold tabular-nums">
                    {controller.slide} / {length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next slide"
                    disabled={controller.slide >= length}
                    className="flex size-11 items-center justify-center rounded-full transition-colors duration-200 hover:bg-site-dark/10 disabled:pointer-events-none disabled:opacity-40 [&:not([disabled])]:cursor-pointer"
                    onClick={() => setController((prev) => ({ ...prev, slide: prev.slide + 1 }))}
                  >
                    <MorphIcon icon={ChevronRight} size={22} strokeWidth={2.25} />
                  </button>
                  <div className="mx-1 h-6 w-px bg-site-dark/25" />
                </>
              )}
              <DialogPrimitive.Close className="flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 hover:bg-site-dark/10">
                <MorphIcon icon={X} size={20} strokeWidth={2.25} />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
