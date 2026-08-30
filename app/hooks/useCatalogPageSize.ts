import { useLayoutEffect, useState } from 'react'
import { CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE_NARROW } from '~/services/productCatalog'

const wideQuery = '(min-width: 640px)'

function pageSizeForViewport() {
  if (typeof window === 'undefined') {
    return CATALOG_PAGE_SIZE
  }

  return window.matchMedia(wideQuery).matches ? CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE_NARROW
}

export default function useCatalogPageSize() {
  const [pageSize, setPageSize] = useState(pageSizeForViewport)

  useLayoutEffect(() => {
    const media = window.matchMedia(wideQuery)
    const sync = () => setPageSize(media.matches ? CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE_NARROW)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return pageSize
}
