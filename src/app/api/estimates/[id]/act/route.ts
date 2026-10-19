// POST /api/estimates/[id]/act { entries: [{lineId, qty}], periodFrom, periodTo, note }
// Еженедельный акт из строк сметы: копируем name/qty/unit/price/section,
// сервер проверяет остаток (qty - doneQty) — двойное включение невозможно.

import { NextResponse } from 'next/server'
import { createActFromEstimateLines } from '@/db/queries'
import { badRequest, notFound, readBody, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

type Entry = { lineId: number; qty: number }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  const body = await readBody(req)
  const rawEntries = body?.entries
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return badRequest('entries обязателен: [{lineId, qty}]')
  }
  if (rawEntries.length > 100) return badRequest('Максимум 100 строк за акт')

  const entries: Entry[] = []
  for (const raw of rawEntries) {
    if (typeof raw !== 'object' || raw === null) return badRequest('Некорректная запись')
    const r = raw as Record<string, unknown>
    const lineId = Number(r.lineId)
    const qty = Number(r.qty)
    if (!Number.isInteger(lineId) || lineId <= 0) return badRequest('Некорректный lineId')
    if (!Number.isFinite(qty) || qty <= 0) return badRequest('Некорректный qty')
    entries.push({ lineId, qty })
  }
  const periodFrom = typeof body?.periodFrom === 'string' ? body.periodFrom : null
  const periodTo = typeof body?.periodTo === 'string' ? body.periodTo : null
  const note = typeof body?.note === 'string' ? body.note : ''

  try {
    const estimate = await (await import('@/lib/db')).db.estimate.findUnique({
      where: { id: estId },
      select: { objectId: true },
    })
    if (!estimate) return notFound('Смета не найдена')

    const result = await createActFromEstimateLines({
      objectId: estimate.objectId,
      estimateId: estId,
      entries,
      periodFrom,
      periodTo,
      note,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code })
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Не удалось создать акт' }, { status: 500 })
  }
}
