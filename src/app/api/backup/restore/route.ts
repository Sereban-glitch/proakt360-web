// POST /api/backup/restore — восстановление из JSON-бэкапа.
// ВАЖНО: замещает текущие данные. Требует сессию мастера.

import { NextResponse } from 'next/server'
import { restoreBackup, type BackupPayload } from '@/db/queries'
import { badRequest, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  let data: unknown
  try {
    data = await req.json()
  } catch {
    return badRequest('Некорректный JSON')
  }
  const result = await restoreBackup(data as BackupPayload)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, counts: result.counts })
}
