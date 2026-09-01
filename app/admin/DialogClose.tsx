import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide'
import { MorphIcon } from 'morphicons/react'

export function DialogCloseButton({ className }: { className?: string }) {
  return (
    <div
      className={`z-20 flex justify-end max-md:pointer-events-none max-md:sticky max-md:top-0 max-md:h-0 max-md:w-full md:absolute md:top-4 md:right-4 ${className ?? ''}`}
    >
      <DialogPrimitive.Close
        className="pointer-events-auto relative top-4 mr-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-site-gunmetal/95 text-site-mantle ring-1 ring-site-mulled-wine/60 hover:text-site-gray-nurse max-md:top-4 max-md:mr-4 md:top-0 md:mr-0 md:rounded-none md:bg-transparent md:ring-0"
        aria-label="Close"
      >
        <MorphIcon icon={X} size={20} strokeWidth={2.25} />
      </DialogPrimitive.Close>
    </div>
  )
}
