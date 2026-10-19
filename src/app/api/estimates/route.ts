// GET  /api/estimates?objectId=N — сметы объекта (или все).
// POST /api/estimates — новая смета (draft).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { estimateBrief, listEstimateBriefs, ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { asNumber, asString, badRequest, notFound, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const url = new URL(req.url)
  const objectIdRaw = url.searchParams.get('objectId')
  let objectId: number | undefined
  if (objectIdRaw !== null && objectIdRaw !== '') {
    const n = Number(objectIdRaw)
    if (!Number.isInteger(n) || n <= 0) return badRequest('Некорректный objectId')
    objectId = n
  }
  try {
    const items = await listEstimateBriefs(objectId)
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить сметы' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const objectId = asNumber(body.objectId)
  const title = asString(body.title)?.trim() ?? ''
  const note = asString(body.note)?.trim() ?? ''
  const coeff = body.coeff === undefined ? 1 : asNumber(body.coeff)
  if (objectId === null || !Number.isInteger(objectId) || objectId <= 0) {
    return badRequest('Некорректный objectId')
  }
  if (!title) return badRequest('Укажите название сметы')
  if (title.length > 200) return badRequest('Название слишком длинное (макс. 200)')
  if (coeff === null || coeff <= 0 || coeff > 10) return badRequest('Коэффициент должен быть числом 0 < k ≤ 10')

  try {
    const object = await db.buildObject.findUnique({ where: { id: objectId } })
    if (!object) return notFound('Объект не найден')
    const estimate = await db.estimate.create({
      data: { objectId, title, note, coeff, status: 'draft' },
      include: ESTIMATE_FULL_INCLUDE,
    })
    return NextResponse.json(estimateBrief(estimate))
  } catch {
    return NextResponse.json({ error: 'Не удалось создать смету' }, { status: 500 })
  }
}
