// DELETE /api/payments/[id] — удалить оплату.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const payId = parseId(id)
  if (payId === null) return badRequest('Некорректный id оплаты')
  try {
    const existing = await db.payment.findUnique({ where: { id: payId } })
    if (!existing) return notFound('Оплата не найдена')
    await db.payment.delete({ where: { id: payId } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить оплату' }, { status: 500 })
  }
}
