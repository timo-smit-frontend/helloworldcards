import { useState } from 'react'
import Image from '~/components/elements/Image'

const MAX_POKEMON_ID = 1025
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const SPRITE_SIZE = 96

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1
}

export default function Pokemon({ id: idProp, className }: { id?: string | number; className?: string }) {
  const [randomId] = useState(randomPokemonId)
  const id = idProp ?? randomId

  return (
    <Image
      src={`${SPRITE_BASE}/${id}.png`}
      alt={idProp != null ? `Pokémon #${idProp}` : 'Random Pokémon'}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      className={className}
      maxwidth={SPRITE_SIZE * 2}
    />
  )
}
