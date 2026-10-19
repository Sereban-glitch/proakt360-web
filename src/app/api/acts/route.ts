// GET /api/acts?objectId=&q= — акты (поиск по объекту/номеру, без учёта регистра).

import { NextResponse } from 'next/server'
import { listActBriefs } from '@/db/queries'
import { badRequest, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const url = new URL(req.url)
  let objectId: number | undefined
  const objectIdRaw = url.searchParams.get('objectId')
  if (objectIdRaw !== null && objectIdRaw !== '') {
    const n = Number(objectIdRaw)
    if (!Number.isInteger(n) || n <= 0) return badRequest('Некорректный objectId')
    objectId = n
  }
  const q = url.searchParams.get('q') ?? ''
  try {
    const items = await listActBriefs({ objectId, q })
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить акты' }, { status: 500 })
  }
}
