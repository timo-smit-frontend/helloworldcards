/** The picture carried while dragging is a thumbnail, not the browser's snapshot of the whole tile. */
export const DRAG_GHOST_SIZE = 96
const GHOST_RADIUS = 14
const GHOST_PADDING = 4
// site-dark, the tile background.
const GHOST_BACKGROUND = '#1C2030'
const LANDING_MS = 320

export type DragGhost = HTMLCanvasElement

/**
 * Draw a small copy of the tile's picture to use as the drag image. It is put on screen
 * under the pointer — exactly where the browser will show the drag image — and hidden a
 * frame later, once the browser has taken its snapshot: Safari takes a blank image from
 * anything that is not on screen at that moment.
 */
export function createDragGhost(tile: HTMLElement, at: { x: number; y: number }): DragGhost | null {
  const picture = tile.querySelector('img')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const scale = window.devicePixelRatio || 1
  canvas.width = DRAG_GHOST_SIZE * scale
  canvas.height = DRAG_GHOST_SIZE * scale
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${at.x - DRAG_GHOST_SIZE / 2}px`,
    top: `${at.y - DRAG_GHOST_SIZE / 2}px`,
    width: `${DRAG_GHOST_SIZE}px`,
    height: `${DRAG_GHOST_SIZE}px`,
    pointerEvents: 'none',
    zIndex: '1000'
  })

  context.scale(scale, scale)
  context.beginPath()
  if (typeof context.roundRect === 'function') {
    context.roundRect(0, 0, DRAG_GHOST_SIZE, DRAG_GHOST_SIZE, GHOST_RADIUS)
  } else {
    context.rect(0, 0, DRAG_GHOST_SIZE, DRAG_GHOST_SIZE)
  }
  context.fillStyle = GHOST_BACKGROUND
  context.fill()
  context.clip()
  if (picture && picture.complete && picture.naturalWidth > 0) {
    const box = DRAG_GHOST_SIZE - GHOST_PADDING * 2
    const ratio = Math.min(box / picture.naturalWidth, box / picture.naturalHeight)
    const width = picture.naturalWidth * ratio
    const height = picture.naturalHeight * ratio
    context.drawImage(picture, GHOST_PADDING + (box - width) / 2, GHOST_PADDING + (box - height) / 2, width, height)
  }

  document.body.appendChild(canvas)
  requestAnimationFrame(() => {
    canvas.style.visibility = 'hidden'
  })
  return canvas
}

/**
 * Carry the ghost from where it was let go into the tile it was dropped on, shrinking on
 * the way, so the image is seen going into the folder rather than just vanishing from
 * the grid. Resolves once it has arrived; with reduced motion it arrives at once.
 */
export function landDragGhost(ghost: DragGhost, from: { x: number; y: number }, target: DOMRect): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof ghost.animate !== 'function') {
    ghost.remove()
    return Promise.resolve()
  }
  Object.assign(ghost.style, {
    left: `${from.x - DRAG_GHOST_SIZE / 2}px`,
    top: `${from.y - DRAG_GHOST_SIZE / 2}px`,
    visibility: 'visible'
  })
  const dx = target.left + target.width / 2 - from.x
  const dy = target.top + target.height / 2 - from.y
  const landing = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.3 }
    ],
    { duration: LANDING_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
  )
  return landing.finished.then(
    () => ghost.remove(),
    () => ghost.remove()
  )
}

/** Throw a ghost away: the drag was cancelled, or let go somewhere that takes nothing. */
export function discardDragGhost(ghost: DragGhost | null): void {
  ghost?.remove()
}
