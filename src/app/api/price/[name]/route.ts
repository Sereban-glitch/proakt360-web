// DELETE /api/price/[name] — удалить позицию прайса (name — нормализованное наименование).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normName } from '@/db/parse'
import { badRequest, notFound, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { name } = await params
  let raw = name
  try {
    raw = decodeURIComponent(name)
  } catch {
    raw = name
  }
  const norm = normName(raw)
  if ([...norm].length < 2) return badRequest('Некорректное наименование')
  try {
    const existing = await db.priceItem.findUnique({ where: { name: norm } })
    if (!existing) return notFound('Позиция прайса не найдена')
    await db.priceItem.delete({ where: { name: norm } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить позицию прайса' }, { status: 500 })
  }
}
