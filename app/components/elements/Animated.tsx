import { cloneElement, isValidElement, ReactElement, useRef } from 'react'
import { useInitialDocument } from '~/hooks/initialDocument'
import { useInView } from '~/hooks/useInView'
import { cn } from '~/services/utils'

const DelayToClass = {
  0: 'delay-0',
  100: 'delay-100',
  150: 'delay-150',
  200: 'delay-200',
  300: 'delay-300',
  400: 'delay-400',
  500: 'delay-500',
  600: 'delay-600',
  700: 'delay-700',
  800: 'delay-800',
  900: 'delay-900',
  1000: 'delay-1000',
  1100: 'delay-1100',
  1200: 'delay-1200',
  1300: 'delay-1300',
  1400: 'delay-1400',
  1500: 'delay-1500',
  1600: 'delay-1600',
  1700: 'delay-1700',
  1800: 'delay-1800',
  1900: 'delay-1900',
  2000: 'delay-2000'
}

const AnimationToClass = {
  fade: 'fade-in',
  'fade-up': 'fade-in slide-in-from-bottom-10',
  'fade-down': 'fade-in slide-in-from-top-10',
  'fade-left': 'fade-in slide-in-from-right-10',
  'fade-right': 'fade-in slide-in-from-bottom-10'
}

const EaseToClass = {
  linear: 'ease-linear',
  in: 'ease-in',
  out: 'ease-out',
  'ease-in-out': 'ease-in-out'
}

const DurationToClass = {
  0: 'duration-0',
  75: 'duration-75',
  100: 'duration-100',
  150: 'duration-150',
  200: 'duration-200',
  300: 'duration-300',
  400: 'duration-400',
  500: 'duration-500',
  700: 'duration-700',
  1000: 'duration-1000'
}

type Animation = keyof typeof AnimationToClass
type Delay = keyof typeof DelayToClass
type Easing = keyof typeof EaseToClass
type Duration = keyof typeof DurationToClass

interface AnimatedProps {
  children: ReactElement<HTMLElement>
  animation?: Animation
  direction?: 'in' | 'out'
  delay?: Delay
  easing?: Easing
  duration?: Duration
  reveal?: 'scroll' | 'load'
  className?: string
}

export function Animated({
  animation = 'fade-up',
  direction = 'in',
  delay = 0,
  easing = 'ease-in-out',
  duration = 500,
  reveal = 'scroll',
  children,
  className
}: AnimatedProps) {
  const ref = useRef<HTMLElement>(null)
  const isInitialDocument = useInitialDocument()
  const skipHide = reveal === 'load' && isInitialDocument
  const inView = useInView(ref, {
    once: true
  })
  const shown = skipHide || inView

  const animationClass = cn(
    shown &&
      !skipHide && [
        direction === 'in' ? 'animate-in' : 'animate-out',
        AnimationToClass[animation],
        DelayToClass[delay],
        EaseToClass[easing],
        DurationToClass[duration],
        'fill-mode-both',
        'motion-reduce:animate-none',
        'opacity-100'
      ],
    !shown && '!opacity-0'
  )

  if (!isValidElement(children)) {
    console.warn('[Animated] expects a single valid React element as its child.')
    return null
  }

  return cloneElement(children, {
    // @ts-expect-error - Ref is not a valid prop for all elements
    ref,
    className: cn(children.props.className, animationClass, className)
  })
}
