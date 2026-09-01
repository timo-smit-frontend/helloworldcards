const FILE_EXTENSION = /\.[a-zA-Z0-9]{1,8}$/

export function shouldServeSpaFallback(request: Request, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  if (request.headers.get('Sec-Fetch-Mode') === 'navigate') {
    return !FILE_EXTENSION.test(pathname)
  }

  return !FILE_EXTENSION.test(pathname)
}

export function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}
