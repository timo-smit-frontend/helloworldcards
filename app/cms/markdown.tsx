import { Fragment, type ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) {
      return <strong key={index}>{bold[1]}</strong>
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = link[2]
      const external = href.startsWith('http')
      return (
        <a key={index} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined}>
          {link[1]}
          {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </a>
      )
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

export function Markdown({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n{2,}/)
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{renderInline(paragraph.replace(/\n/g, ' '))}</p>
      ))}
    </>
  )
}
