import { execFile } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { seedMediaFiles } from '../app/cms/seed-media'
import type { CmsDb } from '../worker/cms/db'
import type { MediaBucket } from '../worker/cms/media'
import {
  CMS_SEED_FILES,
  CMS_SEED_PARTS,
  fingerprintSeedFiles,
  parseSeedFiles,
  readCmsState,
  readSeedFiles,
  readSyncedFingerprints,
  renderCmsState,
  restoreSeedFiles,
  writeCmsState,
  writeSeedFiles,
  writeSyncedFingerprints,
  type CmsFingerprints,
  type CmsSeedFiles,
  type CmsSeedPart,
  type CmsState
} from './cms-state'
import { localBin } from './local-bin'
import { cacheMediaOriginal, cachedMediaSource, firstMediaSource } from './media-originals'
import { publicMediaSource, syncLocalMedia } from './media-sync'

/** Long enough that a burst of edits publishes once, short enough to feel immediate. */
const PUBLISH_DELAY_MS = 1500

/** An editor saves a file in a couple of writes; wait for the last of them. */
const FILE_EDIT_DELAY_MS = 1500

/** How often to look for something typed into the production admin. */
const POLL_INTERVAL_MS = 5 * 60 * 1000

const LOG = '[cms-sync]'

export type CmsAutoSync = {
  /** Called after an admin request changed something, to publish it shortly after. */
  noteWrite(): void
  /** Called when a seed file changed on disk, to apply an edit made there shortly after. */
  noteFileChange(): void
  /** Compare both sides and settle the difference. Runs at startup, on a timer, and when
   * a seed file changes on disk. */
  start(): void
  /** Resolves once everything queued so far has run. */
  idle(): Promise<void>
  /** Resolves once the task that was already running has finished, so the caller can wait
   * before tearing the Wrangler state down under it. */
  stop(): Promise<void>
}

export type CmsAutoSyncOptions = {
  root: string
  db: CmsDb
  media: MediaBucket
  /** Runs `scripts/cms-sync.mts` with the given arguments; a test stands in for the child process. */
  runSync?: (root: string, args: string[]) => Promise<void>
  /** Which seed files differ from git HEAD; a test can decide instead of git. */
  fileStatus?: (root: string) => Promise<Partial<Record<CmsSeedPart, boolean>> | null>
}

export function autoSyncEnabled(): boolean {
  return process.env.HWC_CMS_AUTOSYNC !== '0'
}

/**
 * One part of the CMS as the four places that hold it stand: what this database last
 * settled on with production, the two databases, and the committed file. Each is a
 * fingerprint of the rendered file, `null` where there is nothing.
 */
export type PartView = {
  synced: string | null
  local: string
  remote: string
  file: string | null
  /** Whether the file differs from what git has at HEAD; `null` when git could not say. */
  fileDirty: boolean | null
}

/**
 * - `idle`: everything agrees.
 * - `settle`: the databases agree; record that and bring the file along.
 * - `publish`: the local admin was used; send it to production.
 * - `overwrite`: both admins were used; the local version wins, the production one is named.
 * - `adopt`: the production admin was used; take it.
 * - `apply`: the file was edited by hand; put it in both databases.
 * - `hold`: git moved the file while nothing was edited; leave everything as it is.
 */
export type PartAction = 'idle' | 'settle' | 'publish' | 'overwrite' | 'adopt' | 'apply' | 'hold'

/**
 * Settle one part. A side that differs from what was last settled is the side that
 * changed. A database with no such record may be fresh, wiped or copied from elsewhere,
 * so it is never taken to be ahead: production is live and wins whenever the two differ.
 *
 * A file that changed on its own is only applied when the change is uncommitted — an
 * edit somebody made — never when git checked it out that way, since switching to a
 * branch must not rewrite the content of the live site.
 */
export function decidePart(view: PartView): PartAction {
  const { synced, local, remote, file, fileDirty } = view

  if (synced === null) {
    if (local !== remote) {
      return 'adopt'
    }
    return file !== null && file !== local && fileDirty === true ? 'apply' : 'settle'
  }

  const localChanged = local !== synced
  const remoteChanged = remote !== synced
  if (localChanged && remoteChanged) {
    return local === remote ? 'settle' : 'overwrite'
  }
  if (localChanged) {
    return 'publish'
  }
  if (remoteChanged) {
    return 'adopt'
  }
  if (file === null) {
    return 'settle'
  }
  if (file === synced) {
    return 'idle'
  }
  return fileDirty === true ? 'apply' : 'hold'
}

/**
 * What to log when a sync run fails. A production database that is behind the committed
 * migrations is the one failure with a known fix, so it is named in a line rather than
 * dumped as the child process's stack trace, which says the same thing at great length.
 */
export function syncFailureMessage(error: { message: string }, stdout: string, stderr: string): string {
  const behind = `${stdout}\n${stderr}`.match(/no such (table|column): (\w+)/)
  if (behind) {
    return `production database has no ${behind[1]} ${behind[2]} yet — run \`npm run migrate:remote\` to apply the committed migrations, or deploy`
  }
  return `${error.message}\n${stderr}`.trim()
}

/**
 * Everything that talks to production runs in another process: the Wrangler CLI is
 * synchronous and would otherwise stall the dev server for the length of a round trip.
 */
function runCmsSync(root: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // HWC_CMS_AUTOSYNC keeps the child from starting a sync of its own, whatever server
    // `vite-node` decides to boot on the way to running the script.
    const options = { cwd: root, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HWC_CMS_AUTOSYNC: '0' } }
    const viteNode = localBin('vite-node')
    execFile(viteNode.command, [...viteNode.args, 'scripts/cms-sync.mts', ...args], options, (error, stdout, stderr) => {
      for (const line of String(stdout).split('\n')) {
        const reported = line.match(/^(?:cms|media)-sync: (.*)$/)
        if (reported) {
          console.log(`${LOG} ${reported[1]}`)
        }
      }
      if (error) {
        reject(new Error(syncFailureMessage(error, String(stdout), String(stderr))))
        return
      }
      resolve()
    })
  })
}

/**
 * Which seed files differ from git's HEAD — an edit somebody made, or a file git does
 * not know — as opposed to files git itself checked out. `null` when git cannot say.
 */
export function seedFilesDirty(root: string): Promise<Partial<Record<CmsSeedPart, boolean>> | null> {
  const files = CMS_SEED_PARTS.map((part) => CMS_SEED_FILES[part])
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain', '--', ...files], { cwd: root }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const dirty: Partial<Record<CmsSeedPart, boolean>> = {}
      for (const part of CMS_SEED_PARTS) {
        dirty[part] = false
      }
      for (const line of String(stdout).split('\n')) {
        const changed = line.slice(3).trim()
        for (const part of CMS_SEED_PARTS) {
          if (changed.endsWith(CMS_SEED_FILES[part])) {
            dirty[part] = true
          }
        }
      }
      resolve(dirty)
    })
  })
}

const partFlag = (part: CmsSeedPart): string => `--${part}`

export function createCmsAutoSync(options: CmsAutoSyncOptions): CmsAutoSync {
  const { root, db, media, runSync = runCmsSync, fileStatus = seedFilesDirty } = options
  const seedKeys = new Set(seedMediaFiles.map((file) => file.key))

  let chain: Promise<unknown> = Promise.resolve()
  let debounce: NodeJS.Timeout | null = null
  let fileDebounce: NodeJS.Timeout | null = null
  let poll: NodeJS.Timeout | null = null
  let watchers: FSWatcher[] = []
  let stopped = false
  /** Holds are logged once per state, not every five minutes. */
  const heldLogged = new Set<string>()

  function enqueue(what: string, task: () => Promise<void>): void {
    chain = chain
      .then(() => (stopped ? undefined : task()))
      .catch((error: unknown) => {
        // A task still running through a shutdown fails against state that is being torn
        // down, which says nothing about the sync.
        if (stopped) {
          return
        }
        console.error(`${LOG} ${what} failed:`, error instanceof Error ? error.message : error)
      })
  }

  /**
   * An image uploaded through the admin has no file in the repo, so its original is kept
   * on disk where the push running in another process can read it without opening the
   * Wrangler state this server is holding.
   */
  async function cacheUploadedOriginals(state: CmsState): Promise<void> {
    const cached = cachedMediaSource(root)
    for (const entry of state.media.media) {
      if (seedKeys.has(entry.key) || (await cached(entry.key))) {
        continue
      }
      const object = await media.get(entry.key)
      if (object) {
        await cacheMediaOriginal(root, entry.key, new Uint8Array(await object.arrayBuffer()))
      }
    }
  }

  /** Bring the local bucket in line with the library rows the database now holds. */
  async function syncBucket(state: CmsState): Promise<void> {
    const result = await syncLocalMedia({
      root,
      bucket: media,
      mediaRowKeys: state.media.media.map((entry) => entry.key),
      fallback: firstMediaSource(cachedMediaSource(root), publicMediaSource()),
      log: () => {}
    })
    if (result.skipped.length > 0) {
      console.log(`${LOG} production has no readable original for ${result.skipped.join(', ')}`)
    }
  }

  /**
   * A database that has never settled but already matches the committed files is taken
   * to have settled there: the files were the record before the database kept its own.
   * This looks at nothing but the local side, so it runs before production is reached:
   * a dev server that cannot reach it would otherwise have nothing to measure a later
   * edit against, and that edit would be adopted away once it could.
   */
  async function recordSyncedFromFiles(): Promise<CmsFingerprints> {
    const synced = await readSyncedFingerprints(db)
    if (CMS_SEED_PARTS.every((part) => synced[part] !== undefined)) {
      return synced
    }
    const files = fingerprintSeedFiles(await readSeedFiles(root))
    const local = fingerprintSeedFiles(await renderCmsState(root, await readCmsState(db)))
    const record: CmsFingerprints = {}
    for (const part of CMS_SEED_PARTS) {
      if (synced[part] === undefined && files[part] !== undefined && files[part] === local[part]) {
        record[part] = local[part]
      }
    }
    if (Object.keys(record).length > 0) {
      await writeSyncedFingerprints(db, record)
    }
    return { ...synced, ...record }
  }

  /**
   * Write the files for some parts and push them to production, then record what was
   * sent. The push reads the files, so they are written first; a push that fails puts
   * them back, so that what is committed never claims more than production has.
   */
  async function pushParts(parts: CmsSeedPart[], rendered: CmsSeedFiles): Promise<void> {
    const previous = await readSeedFiles(root)
    const changed = await writeSeedFiles(root, rendered, parts)
    if (changed.length > 0) {
      console.log(`${LOG} recorded ${changed.join(', ')}`)
    }
    try {
      await runSync(root, ['--remote', ...parts.map(partFlag)])
    } catch (error) {
      await restoreSeedFiles(root, previous, changed)
      throw error
    }
    await writeSyncedFingerprints(db, fingerprintSeedFiles(pick(rendered, parts)))
  }

  /** Publish what the local admin changed: the parts that differ from the last settle. */
  async function publish(): Promise<void> {
    const synced = await recordSyncedFromFiles()

    // A database with no record for some part cannot tell an edit from being stale, so
    // production has to be looked at before anything is sent.
    if (CMS_SEED_PARTS.some((part) => synced[part] === undefined)) {
      await reconcile()
      return
    }

    const state = await readCmsState(db)
    await cacheUploadedOriginals(state)
    const rendered = await renderCmsState(root, state)
    const local = fingerprintSeedFiles(rendered)
    const parts = CMS_SEED_PARTS.filter((part) => local[part] !== synced[part])
    if (parts.length === 0) {
      return
    }
    warnAboutFileEdits(parts, fingerprintSeedFiles(await readSeedFiles(root)), synced, local)
    await pushParts(parts, rendered)
  }

  /** A file edited by hand that a publish or adopt is about to rewrite deserves a line. */
  function warnAboutFileEdits(parts: CmsSeedPart[], files: CmsFingerprints, synced: CmsFingerprints, winning: CmsFingerprints): void {
    for (const part of parts) {
      if (files[part] !== undefined && files[part] !== synced[part] && files[part] !== winning[part]) {
        console.warn(`${LOG} ${CMS_SEED_FILES[part]} was also edited on disk; overwriting it with the version being synced`)
      }
    }
  }

  async function reconcile(): Promise<void> {
    const synced = await recordSyncedFromFiles()
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-cms-'))
    const dump = path.join(directory, 'remote.json')
    try {
      // A dry run, so the committed files are never left holding production's state while
      // the two sides are still being compared.
      await runSync(root, ['--remote', '--pull', '--dry-run', '--dump', dump])
      const remoteState = JSON.parse(await fs.readFile(dump, 'utf8')) as CmsState
      const remoteRendered = await renderCmsState(root, remoteState)
      // Read after the round trip, so an edit made during it is not sent back stale.
      const localState = await readCmsState(db)
      await cacheUploadedOriginals(localState)
      const localRendered = await renderCmsState(root, localState)

      const files = await readSeedFiles(root)
      const fileprints = fingerprintSeedFiles(files)
      const dirty = await fileStatus(root)
      const local = fingerprintSeedFiles(localRendered)
      const remote = fingerprintSeedFiles(remoteRendered)

      const actions = new Map<PartAction, CmsSeedPart[]>()
      for (const part of CMS_SEED_PARTS) {
        const action = decidePart({
          synced: synced[part] ?? null,
          local: local[part]!,
          remote: remote[part]!,
          file: fileprints[part] ?? null,
          fileDirty: dirty ? (dirty[part] ?? false) : null
        })
        actions.set(action, [...(actions.get(action) ?? []), part])
      }

      const held = actions.get('hold') ?? []
      for (const part of held) {
        const key = `${part}:${fileprints[part]}`
        if (!heldLogged.has(key)) {
          heldLogged.add(key)
          console.warn(
            `${LOG} ${CMS_SEED_FILES[part]} was changed by git, not by an admin; leaving both databases as they are — run \`npm run cms:push:remote\` to apply the file to production, and the local database will follow`
          )
        }
      }

      const adopted = actions.get('adopt') ?? []
      if (adopted.length > 0) {
        if (CMS_SEED_PARTS.some((part) => synced[part] === undefined)) {
          console.log(`${LOG} this database has no record of a last sync, so production's version is taken`)
        }
        warnAboutFileEdits(adopted, fileprints, synced, remote)
        await writeSeedFiles(root, remoteRendered, adopted)
        await writeCmsState(db, remoteState, adopted)
        if (adopted.includes('media')) {
          await syncBucket(remoteState)
        }
        await writeSyncedFingerprints(db, pick(remote, adopted))
        console.log(`${LOG} took ${adopted.join(', ')} from production`)
      }

      const applied = actions.get('apply') ?? []
      if (applied.length > 0) {
        const state = { ...localState, ...parseSeedFiles(files, applied) }
        await writeCmsState(db, state, applied)
        if (applied.includes('media')) {
          await syncBucket(state)
        }
        console.log(`${LOG} applied the edit made to ${applied.map((part) => CMS_SEED_FILES[part]).join(', ')}`)
      }

      const overwritten = actions.get('overwrite') ?? []
      for (const part of overwritten) {
        // Both admins were used since the last sync. The one being worked in wins, but the
        // production edit is named so it can be redone rather than quietly disappearing.
        console.warn(`${LOG} production also changed ${part}; keeping the local version and overwriting it`)
      }

      const published = [...(actions.get('publish') ?? []), ...overwritten]
      warnAboutFileEdits(published, fileprints, synced, local)

      // Whatever was applied is read back from the database, so the file is left in the
      // form a pull writes rather than however it was typed.
      const sending = [...applied, ...published]
      if (sending.length > 0) {
        const rendered = applied.length > 0 ? await renderCmsState(root, await readCmsState(db)) : localRendered
        await pushParts(sending, rendered)
      }

      const settled = actions.get('settle') ?? []
      if (settled.length > 0) {
        await writeSeedFiles(root, localRendered, settled)
        await writeSyncedFingerprints(db, pick(local, settled))
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }

  /**
   * A seed file changed on disk. The sync writes these files itself, so most changes are
   * its own and already recorded; only one that is not is worth a round trip to settle.
   */
  async function settleFileChange(): Promise<void> {
    const files = fingerprintSeedFiles(await readSeedFiles(root))
    const synced = await readSyncedFingerprints(db)
    if (CMS_SEED_PARTS.every((part) => files[part] !== undefined && files[part] === synced[part])) {
      return
    }
    await reconcile()
  }

  /**
   * Vite is told to ignore the seed files — `seed-products.ts` is a config dependency
   * and would restart the server on every publish — so the sync watches them itself.
   * The directories are watched rather than the files: an editor saving through a
   * rename would otherwise leave the watch on a file that no longer exists.
   */
  function watchSeedFiles(onChange: () => void): FSWatcher[] {
    const directories = new Map<string, Set<string>>()
    for (const part of CMS_SEED_PARTS) {
      const file = path.join(root, CMS_SEED_FILES[part])
      const names = directories.get(path.dirname(file)) ?? new Set<string>()
      names.add(path.basename(file))
      directories.set(path.dirname(file), names)
    }
    const started: FSWatcher[] = []
    for (const [directory, names] of directories) {
      try {
        const watcher = watch(directory, { persistent: false }, (_event, filename) => {
          if (filename && names.has(String(filename))) {
            onChange()
          }
        })
        watcher.on('error', () => {})
        started.push(watcher)
      } catch {
        // A directory that cannot be watched is still covered by the poll.
      }
    }
    return started
  }

  const sync: CmsAutoSync = {
    noteWrite() {
      if (debounce) {
        clearTimeout(debounce)
      }
      debounce = setTimeout(() => enqueue('publish', publish), PUBLISH_DELAY_MS)
      debounce.unref()
    },
    noteFileChange() {
      if (fileDebounce) {
        clearTimeout(fileDebounce)
      }
      fileDebounce = setTimeout(() => enqueue('file change', settleFileChange), FILE_EDIT_DELAY_MS)
      fileDebounce.unref()
    },
    start() {
      enqueue('reconcile', reconcile)
      poll = setInterval(() => enqueue('reconcile', reconcile), POLL_INTERVAL_MS)
      poll.unref()
      watchers = watchSeedFiles(() => sync.noteFileChange())
    },
    async idle() {
      await chain
    },
    async stop() {
      stopped = true
      if (debounce) {
        clearTimeout(debounce)
      }
      if (fileDebounce) {
        clearTimeout(fileDebounce)
      }
      if (poll) {
        clearInterval(poll)
      }
      for (const watcher of watchers) {
        watcher.close()
      }
      await chain
    }
  }
  return sync
}

function pick<T extends Partial<Record<CmsSeedPart, unknown>>>(record: T, parts: CmsSeedPart[]): T {
  const picked: Partial<Record<CmsSeedPart, unknown>> = {}
  for (const part of parts) {
    picked[part] = record[part]
  }
  return picked as T
}
