import { isValidEmail } from './utils'

export const CONTACT_EMAIL = 'helloworldcards@outlook.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/helloworldcards/'

const FORMSUBMIT_ENDPOINT = `https://formsubmit.co/ajax/${CONTACT_EMAIL}`

export async function sendContactMessage({ name, email, message }: { name: string; email: string; message: string }) {
  if (!isValidEmail(email)) {
    throw new Error('Invalid email address')
  }

  const response = await fetch(FORMSUBMIT_ENDPOINT, {
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
      _subject: `Hello World Cards — message from ${name}`,
      _template: 'table',
      _captcha: 'false'
    })
  })

  const data = (await response.json()) as { success?: boolean | string; message?: string }

  if (!response.ok || data.success === false || data.success === 'false') {
    throw new Error(data.message ?? 'Failed to send message')
  }
}
