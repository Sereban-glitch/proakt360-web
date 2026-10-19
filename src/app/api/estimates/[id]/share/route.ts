// POST /api/estimates/[id]/share — новая share-ссылка для заказчика.

import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id сметы')

  try {
    const existing = await db.estimate.findUnique({ where: { id: estId } })
    if (!existing) return notFound('Смета не найдена')
    const token = randomBytes(16).toString('hex')
    await db.estimate.update({ where: { id: estId }, data: { shareToken: token } })
    return NextResponse.json({ token, url: `/api/client/${token}` })
  } catch {
    return NextResponse.json({ error: 'Не удалось создать ссылку' }, { status: 500 })
  }
}
