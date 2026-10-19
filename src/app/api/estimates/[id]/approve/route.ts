// POST /api/estimates/[id]/approve — согласование сметы.
// Доступ: мастер (сессия) ИЛИ клиент по токену объекта/сметы.
// {token} в теле — клиентский токен; тогда статус может только расти
// (draft/sent → approved, снятие согласования — только мастер).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId, readBody } from '@/db/http'
import { checkMaster, resolveClientToken } from '@/db/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  const body = await readBody(req)
  const token = typeof body?.token === 'string' ? body.token : ''

  const estimate = await db.estimate.findUnique({
    where: { id: estId },
    select: { id: true, objectId: true, status: true },
  })
  if (!estimate) return notFound('Смета не найдена')

  if (token) {
    const resolved = await resolveClientToken(token)
    if (!resolved.ok || resolved.objectId !== estimate.objectId) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    if (estimate.status === 'done') {
      return badRequest('Смета уже закрыта')
    }
    await db.estimate.update({
      where: { id: estId },
      data: { status: 'approved', approvedAt: new Date() },
    })
    return NextResponse.json({ status: 'approved' })
  }

  const access = await checkMaster()
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  const revert = body?.revert === true
  if (revert) {
    await db.estimate.update({
      where: { id: estId },
      data: { status: 'sent', approvedAt: null },
    })
    return NextResponse.json({ status: 'sent' })
  }
  await db.estimate.update({
    where: { id: estId },
    data: { status: 'approved', approvedAt: new Date() },
  })
  return NextResponse.json({ status: 'approved' })
}
