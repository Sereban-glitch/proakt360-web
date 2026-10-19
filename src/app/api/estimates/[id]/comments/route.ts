// GET  /api/estimates/[id]/comments — комментарии к смете (мастер ↔ заказчик).
// POST /api/estimates/[id]/comments { author: 'master'|'client', text, token? }.
// Клиентский доступ — по токену объекта/сметы; master — по сессии.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { asString, badRequest, notFound, parseId, readBody } from '@/db/http'
import { checkMaster, resolveClientToken } from '@/db/auth'

export const dynamic = 'force-dynamic'

async function estimateObjectOf(estId: number): Promise<number | null> {
  const est = await db.estimate.findUnique({
    where: { id: estId },
    select: { objectId: true },
  })
  return est?.objectId ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  const estimate = await db.estimate.findUnique({ where: { id: estId } })
  if (!estimate) return notFound('Смета не найдена')

  // доступ: мастер-сессия или токен объекта сметы
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (token) {
    const resolved = await resolveClientToken(token)
    if (!resolved.ok || resolved.objectId !== estimate.objectId) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
  } else {
    const access = await checkMaster()
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
  }

  const items = await db.comment.findMany({
    where: { estimateId: estId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const author = asString(body.author) ?? ''
  const text = asString(body.text)?.trim() ?? ''
  const token = asString(body.token) ?? ''
  if (author !== 'master' && author !== 'client') return badRequest('author должен быть master или client')
  if (!text) return badRequest('Текст комментария пуст')
  if (text.length > 2000) return badRequest('Комментарий слишком длинный (макс. 2000)')

  const objectId = await estimateObjectOf(estId)
  if (objectId === null) return notFound('Смета не найдена')

  if (author === 'client') {
    // клиент обязан предъявить валидный токен этого объекта
    if (!token) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    const resolved = await resolveClientToken(token)
    if (!resolved.ok || resolved.objectId !== objectId) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
  } else {
    const access = await checkMaster()
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
  }

  const comment = await db.comment.create({ data: { estimateId: estId, author, text } })
  return NextResponse.json(comment)
}
