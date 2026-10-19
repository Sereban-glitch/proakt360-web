// GET /api/price/suggest?q= — умные подсказки из прайса (совпадение в обе стороны, ≥ 3 символов).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normName } from '@/db/parse'

export const dynamic = 'force-dynamic'

import { requireMaster } from '@/db/http'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const url = new URL(req.url)
  const q = normName(url.searchParams.get('q') ?? '')
  if (q.length < 3) return NextResponse.json({ items: [] })
  try {
    const all = await db.priceItem.findMany({ orderBy: { name: 'asc' } })
    const items = all
      .filter((it) => it.name.includes(q) || q.includes(it.name))
      .slice(0, 8)
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить подсказки' }, { status: 500 })
  }
}
