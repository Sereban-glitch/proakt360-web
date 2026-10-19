// POST /api/estimates/[id]/lines/[lid]/move { dir: 'up' | 'down' } —
// поменять строку местами с соседней и перенумеровать pos.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { asString, badRequest, notFound, parseId, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; lid: string }> }
) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id, lid } = await params
  const estId = parseId(id)
  const lineId = parseId(lid)
  if (estId === null || lineId === null) return badRequest('Некорректный id')

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const dir = asString(body.dir)
  if (dir !== 'up' && dir !== 'down') return badRequest('dir должен быть "up" или "down"')

  try {
    const estimate = await db.estimate.findUnique({ where: { id: estId } })
    if (!estimate) return notFound('Смета не найдена')
    const lines = await db.estimateLine.findMany({
      where: { estimateId: estId },
      orderBy: { pos: 'asc' },
    })
    const idx = lines.findIndex((l) => l.id === lineId)
    if (idx < 0) return notFound('Строка сметы не найдена')
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= lines.length) {
      return NextResponse.json({ moved: false })
    }
    const a = lines[idx]
    const b = lines[target]
    await db.$transaction([
      db.estimateLine.update({ where: { id: a.id }, data: { pos: b.pos } }),
      db.estimateLine.update({ where: { id: b.id }, data: { pos: a.pos } }),
    ])
    // финальная перенумерация 1..n (защита от дубликатов pos)
    const after = await db.estimateLine.findMany({
      where: { estimateId: estId },
      orderBy: { pos: 'asc' },
    })
    await db.$transaction(
      after.map((l, i) => db.estimateLine.update({ where: { id: l.id }, data: { pos: i + 1 } }))
    )
    return NextResponse.json({ moved: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось переместить строку' }, { status: 500 })
  }
}
