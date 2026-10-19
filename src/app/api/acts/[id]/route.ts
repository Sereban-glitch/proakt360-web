// GET    /api/acts/[id] — акт: строки, оплаты, фото.
// DELETE /api/acts/[id] — удалить акт.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActDetail } from '@/db/queries'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const actId = parseId(id)
  if (actId === null) return badRequest('Некорректный id акта')
  try {
    const detail = await getActDetail(actId)
    if (!detail) return notFound('Акт не найден')
    return NextResponse.json(detail)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить акт' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const actId = parseId(id)
  if (actId === null) return badRequest('Некорректный id акта')
  try {
    const existing = await db.act.findUnique({ where: { id: actId } })
    if (!existing) return notFound('Акт не найден')
    await db.act.delete({ where: { id: actId } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить акт' }, { status: 500 })
  }
}
