import type { ReactNode } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, type IconNode } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import Image from '~/components/elements/Image'
import { cn } from '~/services/utils'

const EMPTY_VALUE = '__empty__'

export type ChoiceSelectOption = {
  value: string
  label: string
  image?: string
}

function toSelectValue(value: string) {
  return value === '' ? EMPTY_VALUE : value
}

function fromSelectValue(value: string) {
  return value === EMPTY_VALUE ? '' : value
}

export function ChoiceSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  icon: Icon = ChevronDown,
  plain,
  className,
  'aria-labelledby': ariaLabelledBy,
  'aria-label': ariaLabel
}: {
  id?: string
  value: string
  options: Array<ChoiceSelectOption>
  onChange: (value: string) => void
  placeholder?: ReactNode
  icon?: IconNode
  plain?: boolean
  className?: string
  'aria-labelledby'?: string
  'aria-label'?: string
}) {
  const hasEmptyOption = options.some((option) => option.value === '')
  const hasImages = options.some((option) => option.image)
  const selectValue = value === '' && !hasEmptyOption ? '' : toSelectValue(value)

  return (
    <Select.Root value={selectValue} onValueChange={(next) => onChange(fromSelectValue(next))}>
      <Select.Trigger
        id={id}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        className={cn(
          'flex min-w-0 cursor-pointer items-center justify-between gap-3 py-0 text-left',
          plain
            ? 'h-auto bg-transparent px-0 font-semibold text-site-mantle hover:text-site-gray-nurse data-placeholder:text-site-mantle'
            : 'field hover:border-site-envy data-[state=open]:border-site-envy data-placeholder:text-site-mantle',
          className
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="shrink-0 text-site-mantle">
          <MorphIcon icon={Icon} size={18} strokeWidth={2.25} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-110 overflow-hidden rounded-button border-2 border-site-mulled-wine bg-site-gunmetal shadow-card',
            plain || hasImages ? 'min-w-0 w-[min(calc(100vw-2rem),22rem)] sm:min-w-72' : 'w-(--radix-select-trigger-width)',
            hasImages && 'max-h-[min(50dvh,24rem)] sm:max-h-[min(70dvh,40rem)] sm:min-w-80',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <Select.Viewport
            className={cn(
              'p-1',
              hasImages &&
                'max-h-[min(50dvh,24rem)] overflow-y-scroll [-webkit-overflow-scrolling:touch] [touch-action:pan-y] sm:max-h-[min(70dvh,40rem)]'
            )}
          >
            {options.map((option) => (
              <Select.Item
                key={option.value || EMPTY_VALUE}
                value={toSelectValue(option.value)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] px-3 py-2.5 text-base text-site-gray-nurse outline-none select-none data-highlighted:bg-site-mid data-[state=checked]:text-site-summer-green"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {option.image ? (
                    <span className="block aspect-2/1 w-24 shrink-0 overflow-hidden rounded-panel bg-site-dark p-1 ring-1 ring-site-mulled-wine sm:w-40">
                      <Image
                        src={option.image}
                        alt=""
                        width={160}
                        height={80}
                        maxwidth={320}
                        sizes="10rem"
                        className="size-full object-contain"
                      />
                    </span>
                  ) : null}
                  <Select.ItemText>{option.label}</Select.ItemText>
                </span>
                <Select.ItemIndicator className="shrink-0 text-site-summer-green">
                  <MorphIcon icon={Check} size={16} strokeWidth={2.5} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
