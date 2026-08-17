import { StrictMode } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { App } from '~/app'

export async function render(url: string): Promise<string> {
  const stream = await renderToReadableStream(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>
  )

  await stream.allReady
  return new Response(stream).text()
}
