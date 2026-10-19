// GET    /api/estimates/[id] — смета со строками, комментариями и объектом.
// PATCH  /api/estimates/[id] — обновить title/status/coeff/note (status→done закрывает строки).
// DELETE /api/estimates/[id] — удалить смету.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { estimateBrief, getEstimateDetail, ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { asNumber, asString, badRequest, notFound, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['draft', 'sent', 'approved', 'done'])

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) return badRequest('Некорректный id сметы')
  try {
    const detail = await getEstimateDetail(numId)
    if (!detail) return notFound('Смета не найдена')
    return NextResponse.json(detail)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить смету' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) return badRequest('Некорректный id сметы')
  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')

  const data: { title?: string; status?: string; coeff?: number; note?: string } = {}
  if (body.title !== undefined) {
    const title = asString(body.title)?.trim() ?? ''
    if (!title) return badRequest('Название не может быть пустым')
    if (title.length > 200) return badRequest('Название слишком длинное (макс. 200)')
    data.title = title
  }
  if (body.status !== undefined) {
    const status = asString(body.status) ?? ''
    if (!STATUSES.has(status)) return badRequest('Статус должен быть draft | sent | approved | done')
    data.status = status
  }
  if (body.coeff !== undefined) {
    const coeff = asNumber(body.coeff)
    if (coeff === null || coeff <= 0 || coeff > 10) return badRequest('Коэффициент должен быть числом 0 < k ≤ 10')
    data.coeff = coeff
  }
  if (body.note !== undefined) {
    const note = asString(body.note) ?? ''
    if (note.length > 1000) return badRequest('Заметка слишком длинная (макс. 1000)')
    data.note = note
  }
  if (Object.keys(data).length === 0) return badRequest('Нет полей для обновления')

  try {
    const existing = await db.estimate.findUnique({ where: { id: numId } })
    if (!existing) return notFound('Смета не найдена')
    await db.estimate.update({ where: { id: numId }, data })
    if (data.status === 'done') {
      await db.estimateLine.updateMany({ where: { estimateId: numId }, data: { done: true } })
    }
    const estimate = await db.estimate.findUnique({ where: { id: numId }, include: ESTIMATE_FULL_INCLUDE })
    if (!estimate) return notFound('Смета не найдена')
    return NextResponse.json(estimateBrief(estimate))
  } catch {
    return NextResponse.json({ error: 'Не удалось обновить смету' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) return badRequest('Некорректный id сметы')
  try {
    const existing = await db.estimate.findUnique({ where: { id: numId } })
    if (!existing) return notFound('Смета не найдена')
    await db.estimate.delete({ where: { id: numId } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить смету' }, { status: 500 })
  }
}
