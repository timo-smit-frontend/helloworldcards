import { useState } from 'react'
import Image from '~/components/elements/Image'
import { cn } from '~/services/utils'

const MAX_POKEMON_ID = 1025
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const SPRITE_SIZE = 96

const POKEMON_NAMES: Record<number, string> = {
  3: 'Venusaur',
  9: 'Blastoise',
  25: 'Pikachu',
  54: 'Psyduck',
  79: 'Slowpoke',
  94: 'Gengar',
  133: 'Eevee',
  143: 'Snorlax',
  150: 'Mewtwo',
  151: 'Mew',
  186: 'Politoed',
  194: 'Wooper',
  195: 'Quagsire',
  280: 'Ralts',
  285: 'Shroomish',
  330: 'Flygon'
}

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1
}

function pokemonLabel(id: string | number) {
  return POKEMON_NAMES[Number(id)] ?? `Pokémon #${id}`
}

function PokemonSprite({ id, alt, title, className }: { id: string | number; alt: string; title: string; className?: string }) {
  return <Image src={`${SPRITE_BASE}/${id}.png`} alt={alt} title={title} width={SPRITE_SIZE} height={SPRITE_SIZE} className={className} />
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
  const name = idProp != null ? pokemonLabel(id) : 'Random Pokémon'
  const alt = variant === 'placeholder' ? '' : name

  if (variant === 'placeholder') {
    return (
      <div aria-hidden className={cn('group/poke relative flex items-center justify-center overflow-hidden p-5', className)}>
        <PokemonSprite
          id={id}
          alt={alt}
          title={name}
          className="h-auto w-3/4 max-w-72 origin-center smooth group-hover:scale-110 group-hover/poke:scale-110 motion-reduce:transform-none"
        />
      </div>
    )
  }

  return <PokemonSprite id={id} alt={alt} title={name} className={className} />
}
