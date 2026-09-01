import type { CmsDb } from './db'

export const R2_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024
export const R2_FREE_CLASS_A = 1_000_000
export const R2_FREE_CLASS_B = 10_000_000
export const R2_WARN_AT = 0.5
export const R2_ALERT_AT = 0.8

export type R2UsageMetric = 'storage' | 'classA' | 'classB'
export type R2UsageLevel = 'warn' | 'alert'

export type R2UsageWarning = {
  metric: R2UsageMetric
  level: R2UsageLevel
  used: number
  limit: number
}

export type R2UsageSnapshot = {
  month: string
  storageBytes: number
  classA: number
  classB: number
  limits: {
    storageBytes: number
    classA: number
    classB: number
  }
  warnings: R2UsageWarning[]
}

export function usageMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export function r2Warnings(storageBytes: number, classA: number, classB: number): R2UsageWarning[] {
  const rows: Array<{ metric: R2UsageMetric; used: number; limit: number }> = [
    { metric: 'storage', used: storageBytes, limit: R2_FREE_STORAGE_BYTES },
    { metric: 'classA', used: classA, limit: R2_FREE_CLASS_A },
    { metric: 'classB', used: classB, limit: R2_FREE_CLASS_B }
  ]

  const warnings: R2UsageWarning[] = []
  for (const row of rows) {
    const ratio = row.used / row.limit
    if (ratio >= R2_ALERT_AT) {
      warnings.push({ ...row, level: 'alert' })
    } else if (ratio >= R2_WARN_AT) {
      warnings.push({ ...row, level: 'warn' })
    }
  }
  return warnings
}

export function snapshotR2Usage(month: string, storageBytes: number, classA: number, classB: number): R2UsageSnapshot {
  return {
    month,
    storageBytes,
    classA,
    classB,
    limits: {
      storageBytes: R2_FREE_STORAGE_BYTES,
      classA: R2_FREE_CLASS_A,
      classB: R2_FREE_CLASS_B
    },
    warnings: r2Warnings(storageBytes, classA, classB)
  }
}

export async function incrementR2Usage(db: CmsDb, ops: { classA?: number; classB?: number }, now = new Date()): Promise<void> {
  const classA = ops.classA ?? 0
  const classB = ops.classB ?? 0
  if (classA === 0 && classB === 0) {
    return
  }

  await db
    .prepare(
      `INSERT INTO r2_usage (month, class_a, class_b) VALUES (?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET
         class_a = class_a + excluded.class_a,
         class_b = class_b + excluded.class_b`
    )
    .bind(usageMonth(now), classA, classB)
    .run()
}

export async function getR2Usage(db: CmsDb, now = new Date()): Promise<R2UsageSnapshot> {
  const month = usageMonth(now)
  const storage = await db.prepare('SELECT COALESCE(SUM(bytes), 0) as total FROM media').first<{ total: number }>()
  const row = await db.prepare('SELECT class_a as classA, class_b as classB FROM r2_usage WHERE month = ?').bind(month).first<{
    classA: number
    classB: number
  }>()

  return snapshotR2Usage(month, Number(storage?.total ?? 0), Number(row?.classA ?? 0), Number(row?.classB ?? 0))
}
