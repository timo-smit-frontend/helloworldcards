export const MAX_PRODUCT_IMAGES = 8

export function toggleMediaSelection(urls: string[], url: string, max = MAX_PRODUCT_IMAGES): string[] {
  if (urls.includes(url)) {
    return urls.filter((item) => item !== url)
  }
  if (urls.length >= max) {
    return urls
  }
  return [...urls, url]
}

export function removeMediaUrl(urls: string[], url: string): string[] {
  return urls.filter((item) => item !== url)
}
