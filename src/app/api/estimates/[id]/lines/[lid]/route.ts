// PATCH  /api/estimates/[id]/lines/[lid] — правка строки сметы.
// DELETE /api/estimates/[id]/lines/[lid] — удалить строку с перенумерацией pos.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { estimateBrief, roundMoney, ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { asBool, asNumber, asString, badRequest, notFound, parseId, readBody, requireMaster } from '@/db/http'
import { normalizeUnit } from '@/db/parse'

export const dynamic = 'force-dynamic'

async function loadLine(estId: number, lineId: number) {
  const line = await db.estimateLine.findUnique({ where: { id: lineId } })
  if (!line || line.estimateId !== estId) return null
  return line
}

export async function PATCH(
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

  const data: {
    name?: string
    qty?: number
    unit?: string
    price?: number
    hidden?: boolean
    done?: boolean
    note?: string
    section?: string
  } = {}
  if (body.name !== undefined) {
    const name = asString(body.name)?.trim() ?? ''
    if (!name) return badRequest('Наименование не может быть пустым')
    if (name.length > 300) return badRequest('Наименование слишком длинное (макс. 300)')
    data.name = name
  }
  if (body.qty !== undefined) {
    const qty = asNumber(body.qty)
    if (qty === null || qty <= 0) return badRequest('Количество должно быть числом больше 0')
    data.qty = qty
  }
  if (body.unit !== undefined) {
    const unit = asString(body.unit) ?? ''
    data.unit = normalizeUnit(unit) || unit.trim()
  }
  if (body.price !== undefined) {
    const price = asNumber(body.price)
    if (price === null || price < 0) return badRequest('Цена должна быть числом ≥ 0')
    data.price = price
  }
  if (body.hidden !== undefined) {
    const hidden = asBool(body.hidden)
    if (hidden === null) return badRequest('hidden должен быть boolean')
    data.hidden = hidden
  }
  if (body.done !== undefined) {
    const done = asBool(body.done)
    if (done === null) return badRequest('done должен быть boolean')
    data.done = done
  }
  if (body.note !== undefined) {
    const note = asString(body.note)?.trim() ?? ''
    if (note.length > 500) return badRequest('Заметка слишком длинная (макс. 500)')
    data.note = note
  }
  if (body.section !== undefined) {
    const section = asString(body.section)?.trim() ?? ''
    const allowed = new Set(['стены', 'потолки', 'доп', 'подготовка'])
    if (!allowed.has(section)) return badRequest('section: стены | потолки | доп | подготовка | (пусто)')
    data.section = section
  }
  if (Object.keys(data).length === 0) return badRequest('Нет полей для обновления')

  try {
    const existing = await loadLine(estId, lineId)
    if (!existing) return notFound('Строка сметы не найдена')
    const line = await db.estimateLine.update({ where: { id: lineId }, data })
    const estimate = await db.estimate.findUnique({ where: { id: estId }, include: ESTIMATE_FULL_INCLUDE })
    if (!estimate) return notFound('Смета не найдена')
    return NextResponse.json({
      line: { ...line, sum: roundMoney(line.qty * line.price) },
      estimate: estimateBrief(estimate),
    })
  } catch {
    return NextResponse.json({ error: 'Не удалось обновить строку' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; lid: string }> }
) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id, lid } = await params
  const estId = parseId(id)
  const lineId = parseId(lid)
  if (estId === null || lineId === null) return badRequest('Некорректный id')

  try {
    const existing = await loadLine(estId, lineId)
    if (!existing) return notFound('Строка сметы не найдена')
    await db.estimateLine.delete({ where: { id: lineId } })
    // перенумерация pos: 1..n по текущему порядку
    const rest = await db.estimateLine.findMany({
      where: { estimateId: estId },
      orderBy: { pos: 'asc' },
    })
    await db.$transaction(
      rest.map((l, i) => db.estimateLine.update({ where: { id: l.id }, data: { pos: i + 1 } }))
    )
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить строку' }, { status: 500 })
  }
}
