// DELETE /api/templates/[id] — удалить шаблон работ.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const tplId = parseId(id)
  if (tplId === null) return badRequest('Некорректный id шаблона')
  try {
    const existing = await db.template.findUnique({ where: { id: tplId } })
    if (!existing) return notFound('Шаблон не найден')
    await db.template.delete({ where: { id: tplId } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить шаблон' }, { status: 500 })
  }
}
