import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const EMAIL_MAX_LENGTH = 254
const LOCAL_MAX_LENGTH = 64
const DOMAIN_LABEL_MAX_LENGTH = 63
const LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
const TLD_PATTERN = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/

export function isValidEmail(value: string): boolean {
  const email = value.trim()

  if (email.length < 6 || email.length > EMAIL_MAX_LENGTH) {
    return false
  }

  if (email.includes('..') || /\s/.test(email)) {
    return false
  }

  const atIndex = email.indexOf('@')
  if (atIndex < 1 || atIndex !== email.lastIndexOf('@')) {
    return false
  }

  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)

  if (local.length > LOCAL_MAX_LENGTH || local.startsWith('.') || local.endsWith('.')) {
    return false
  }

  if (!LOCAL_PART_PATTERN.test(local)) {
    return false
  }

  const labels = domain.split('.')
  if (labels.length < 2) {
    return false
  }

  const tld = labels[labels.length - 1]
  if (!tld || !TLD_PATTERN.test(tld)) {
    return false
  }

  return labels.every((label) => label.length <= DOMAIN_LABEL_MAX_LENGTH && DOMAIN_LABEL_PATTERN.test(label))
}
