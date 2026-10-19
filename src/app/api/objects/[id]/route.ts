// GET    /api/objects/[id] — карточка объекта: этапы, акты, сметы, фото.
// DELETE /api/objects/[id] — удалить объект (каскад).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getObjectDetail } from '@/db/queries'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const numId = parseId(id)
  if (numId === null) return badRequest('Некорректный id объекта')
  try {
    const detail = await getObjectDetail(numId)
    if (!detail) return notFound('Объект не найден')
    return NextResponse.json(detail)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить объект' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const numId = parseId(id)
  if (numId === null) return badRequest('Некорректный id объекта')
  try {
    const existing = await db.buildObject.findUnique({ where: { id: numId } })
    if (!existing) return notFound('Объект не найден')
    await db.buildObject.delete({ where: { id: numId } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить объект' }, { status: 500 })
  }
}
