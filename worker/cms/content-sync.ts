import type { CmsEvent, CmsFaq, CmsNavItem, CmsPage, CmsSettings } from '../../app/cms/types'
import {
  batchReads,
  getSettings,
  putSettings,
  replaceNav,
  rowToPage,
  rowToSettings,
  SQL,
  trashRowsMissingFrom,
  upsertEventWithId,
  upsertFaqWithId,
  upsertPageByPath,
  type BatchedRead,
  type CmsDb,
  type PageRow,
  type SettingsRow
} from './db'

/**
 * Everything in the CMS except products and media, in a form that round-trips through
 * `seed/cms-content.json`. Products keep their own seed file; media lives in R2.
 */
export type CmsContentSnapshot = {
  settings: Omit<CmsSettings, 'cmsSeedVersion'>
  nav: Array<Omit<CmsNavItem, 'id'>>
  pages: Array<Omit<CmsPage, 'id'>>
  faqs: CmsFaq[]
  events: CmsEvent[]
}

type CmsContentSyncCounts = {
  nav: number
  pages: number
  faqs: number
  events: number
}

/** The reads a content snapshot is made of, so a pull can send them with its other reads. */
export function contentRead(db: CmsDb): BatchedRead<CmsContentSnapshot> {
  return {
    statements: [db.prepare(SQL.settings), db.prepare(SQL.nav), db.prepare(SQL.pages), db.prepare(SQL.faqs), db.prepare(SQL.events)],
    parse([settingsRows, navRows, pageRows, faqRows, eventRows]) {
      const settings = rowToSettings(settingsRows.results[0] as SettingsRow | undefined)
      if (!settings) {
        throw new Error('This database has no CMS settings row yet.')
      }
      // The seed version tracks the target database's own migration state, so it must never
      // travel between environments in the snapshot.
      const portable = { ...settings }
      delete portable.cmsSeedVersion

      return {
        settings: portable,
        nav: (navRows.results as CmsNavItem[]).map((item) => ({
          location: item.location,
          label: item.label,
          href: item.href,
          sort: item.sort
        })),
        pages: (pageRows.results as PageRow[]).map(rowToPage).map((page) => ({
          path: page.path,
          status: page.status,
          title: page.title,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          seoImage: page.seoImage,
          blocks: page.blocks
        })),
        faqs: faqRows.results as CmsFaq[],
        events: eventRows.results as CmsEvent[]
      }
    }
  }
}

export async function pullContent(db: CmsDb): Promise<CmsContentSnapshot> {
  const [content] = await batchReads(db, [contentRead(db)])
  return content
}

export async function pushContent(db: CmsDb, snapshot: CmsContentSnapshot): Promise<CmsContentSyncCounts> {
  const current = await getSettings(db)
  await putSettings(db, {
    ...snapshot.settings,
    ...(current?.cmsSeedVersion != null ? { cmsSeedVersion: current.cmsSeedVersion } : {})
  })

  await replaceNav(db, snapshot.nav)

  for (const page of snapshot.pages) {
    await upsertPageByPath(db, page)
  }
  for (const faq of snapshot.faqs) {
    await upsertFaqWithId(db, faq.id, { question: faq.question, answer: faq.answer })
  }
  for (const event of snapshot.events) {
    await upsertEventWithId(db, event.id, { title: event.title, date: event.date, location: event.location })
  }

  // A page, FAQ or event deleted in one admin is absent from the snapshot rather than
  // marked, so the target has to trash whatever the snapshot stopped carrying.
  await trashRowsMissingFrom(
    db,
    'pages',
    'path',
    snapshot.pages.map((page) => page.path)
  )
  await trashRowsMissingFrom(
    db,
    'faqs',
    'id',
    snapshot.faqs.map((faq) => faq.id)
  )
  await trashRowsMissingFrom(
    db,
    'events',
    'id',
    snapshot.events.map((event) => event.id)
  )

  return {
    nav: snapshot.nav.length,
    pages: snapshot.pages.length,
    faqs: snapshot.faqs.length,
    events: snapshot.events.length
  }
}

export function formatContentSnapshot(snapshot: CmsContentSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseContentSnapshot(source: string): CmsContentSnapshot {
  const parsed = JSON.parse(source) as Partial<CmsContentSnapshot>
  if (!parsed.settings || !Array.isArray(parsed.nav) || !Array.isArray(parsed.pages)) {
    throw new Error('seed/cms-content.json is not a CMS content snapshot.')
  }
  return {
    settings: parsed.settings,
    nav: parsed.nav,
    pages: parsed.pages,
    faqs: parsed.faqs ?? [],
    events: parsed.events ?? []
  }
}

/** True when the two snapshots would leave a database in the same state. */
export function contentSnapshotsMatch(left: CmsContentSnapshot, right: CmsContentSnapshot): boolean {
  return formatContentSnapshot(left) === formatContentSnapshot(right)
}
