import { isValidEmail } from './utils'

export const CONTACT_EMAIL = 'helloworldcards@outlook.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/helloworldcards/'
export const MARKTPLAATS_URL = 'https://www.marktplaats.nl/u/hello-world-cards/25399885/'

export async function sendContactMessage({
  name,
  email,
  message,
  to = CONTACT_EMAIL
}: {
  name: string
  email: string
  message: string
  to?: string
}) {
  if (!isValidEmail(email)) {
    throw new Error('Invalid email address')
  }

  const response = await fetch(`https://formsubmit.co/ajax/${to}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      name,
      email,
      message,
      _replyto: email,
      _subject: `Hello World Cards: message from ${name}`,
      _template: 'table',
      _captcha: 'false'
    })
  })

  const data = (await response.json()) as { success?: boolean | string; message?: string }

  if (!response.ok || data.success === false || data.success === 'false') {
    throw new Error(data.message ?? 'Failed to send message')
  }
}
