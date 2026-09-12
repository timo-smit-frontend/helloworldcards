const FILE_EXTENSION = /\.[a-zA-Z0-9]{1,8}$/

/** Any extensionless GET or HEAD is a page of the app; everything with an extension is a file. */
export function shouldServeSpaFallback(request: Request, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  return !FILE_EXTENSION.test(pathname)
}

export function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}
