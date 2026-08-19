import { useState } from 'react'
import Image from '~/components/elements/Image'
import { cn } from '~/services/utils'

const MAX_POKEMON_ID = 1025
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const SPRITE_SIZE = 96

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1
}

function PokemonSprite({ id, alt, className }: { id: string | number; alt: string; className?: string }) {
  return <Image src={`${SPRITE_BASE}/${id}.png`} alt={alt} width={SPRITE_SIZE} height={SPRITE_SIZE} className={className} />
}

export default function Pokemon({
  id: idProp,
  className,
  variant = 'sprite'
}: {
  id?: string | number
  className?: string
  variant?: 'sprite' | 'placeholder'
}) {
  const [randomId] = useState(randomPokemonId)
  const id = idProp ?? randomId
  const alt = idProp != null ? `Pokémon #${idProp}` : 'Random Pokémon'

  if (variant === 'placeholder') {
    return (
      <div className={cn('group/poke relative flex items-center justify-center overflow-hidden p-5', className)}>
        <PokemonSprite
          id={id}
          alt={alt}
          className="h-auto w-3/4 max-w-72 origin-center smooth group-hover:scale-110 group-hover/poke:scale-110 motion-reduce:transform-none"
        />
      </div>
    )
  }

  return <PokemonSprite id={id} alt={alt} className={className} />
}
