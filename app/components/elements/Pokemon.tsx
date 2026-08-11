import { useState } from 'react'

const MAX_POKEMON_ID = 1025
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1
}

export default function Pokemon({ id: idProp, className }: { id?: string | number; className?: string }) {
  const [randomId] = useState(randomPokemonId)
  const id = idProp ?? randomId

  return <img src={`${SPRITE_BASE}/${id}.png`} alt={idProp != null ? `Pokémon #${idProp}` : 'Random Pokémon'} className={className} />
}
