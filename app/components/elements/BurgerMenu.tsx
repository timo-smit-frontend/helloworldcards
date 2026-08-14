import { MorphIcon as MorphIconBase, type MorphIconProps } from 'morphicons/react'
import { Menu, X } from 'lucide'

type BurgerMorphIconProps = Omit<MorphIconProps, 'icon' | 'from' | 'to' | 'progress'> & {
  open: boolean
}

export default function BurgerMenu({ open, size = 24, strokeWidth = 2, ...props }: BurgerMorphIconProps) {
  return <MorphIconBase icon={open ? X : Menu} size={size} strokeWidth={strokeWidth} spring="snappy" {...props} />
}
