// POST /api/acts/[id]/payments { amount, note? } — оплата по акту.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { actBrief, ACT_FULL_INCLUDE } from '@/db/queries'
import { asNumber, asString, badRequest, notFound, parseId, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const actId = parseId(id)
  if (actId === null) return badRequest('Некорректный id акта')

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const amount = asNumber(body.amount)
  const note = asString(body.note)?.trim() ?? ''
  if (amount === null || amount <= 0) return badRequest('Сумма должна быть числом больше 0')
  if (note.length > 300) return badRequest('Заметка слишком длинная (макс. 300)')

  try {
    const act = await db.act.findUnique({ where: { id: actId } })
    if (!act) return notFound('Акт не найден')
    const payment = await db.payment.create({ data: { actId, amount, note } })
    const full = await db.act.findUnique({ where: { id: actId }, include: ACT_FULL_INCLUDE })
    if (!full) return notFound('Акт не найден')
    return NextResponse.json({ payment, act: actBrief(full) })
  } catch {
    return NextResponse.json({ error: 'Не удалось добавить оплату' }, { status: 500 })
  }
}
