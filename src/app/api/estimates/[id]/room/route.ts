// POST /api/estimates/[id]/room { preset, area, height, perimeter? } —
// добавить типовое помещение по нормам (потолок S, стены P·h, плинтус P).

import { NextResponse } from 'next/server'
import type { EstimateLine } from '@prisma/client'
import { db } from '@/lib/db'
import { estimateBrief, roundMoney, ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { buildRoomLines, roomPresetByKey } from '@/db/rooms'
import { asNumber, asString, badRequest, notFound, parseId, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const presetKey = asString(body.preset)?.trim() ?? ''
  const area = asNumber(body.area)
  const height = body.height === undefined ? 2.7 : asNumber(body.height)
  const perimeter = body.perimeter === undefined ? 0 : asNumber(body.perimeter)

  const preset = roomPresetByKey(presetKey)
  if (!preset) return badRequest('Неизвестный пресет помещения')
  if (area === null || area <= 0 || area > 10000) return badRequest('Площадь должна быть числом 0 < S ≤ 10000')
  if (height === null || height <= 0 || height > 10) return badRequest('Высота должна быть числом 0 < h ≤ 10')
  if (perimeter !== null && perimeter < 0) return badRequest('Периметр не может быть отрицательным')
  if (perimeter === null) return badRequest('Некорректный периметр')

  try {
    const estimate = await db.estimate.findUnique({ where: { id: estId } })
    if (!estimate) return notFound('Смета не найдена')

    const built = buildRoomLines(preset, area, height, perimeter)
    const maxPos = await db.estimateLine.aggregate({
      where: { estimateId: estId },
      _max: { pos: true },
    })
    let pos = (maxPos._max.pos ?? 0) + 1
    const created: Array<EstimateLine & { sum: number }> = []
    for (const b of built) {
      const line = await db.estimateLine.create({
        data: {
          estimateId: estId,
          pos: pos++,
          name: b.name,
          qty: b.qty,
          unit: b.unit,
          price: b.price,
          hidden: b.hidden,
          note: preset.name,
        },
      })
      created.push({ ...line, sum: roundMoney(line.qty * line.price) })
    }
    const full = await db.estimate.findUnique({ where: { id: estId }, include: ESTIMATE_FULL_INCLUDE })
    if (!full) return notFound('Смета не найдена')
    return NextResponse.json({ added: created.length, lines: created, estimate: estimateBrief(full) })
  } catch {
    return NextResponse.json({ error: 'Не удалось добавить помещение' }, { status: 500 })
  }
}
