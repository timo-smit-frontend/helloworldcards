/// <reference types="vite/client" />

import type { PublicCmsPayload } from './cms/types'

declare global {
  interface Window {
    __CMS__?: PublicCmsPayload | null
    __gtmLoaded?: boolean
  }
}

export {}
