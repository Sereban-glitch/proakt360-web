// GET /api/export/act/[id] — акт в XLSX.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ACT_FULL_INCLUDE } from '@/db/queries'
import { actToXlsx } from '@/db/export'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied
  const { id } = await params
  const actId = parseId(id)
  if (actId === null) return badRequest('Некорректный id')

  const act = await db.act.findUnique({
    where: { id: actId },
    include: { ...ACT_FULL_INCLUDE, object: { select: { name: true, customer: true, clientToken: true } } },
  })
  if (!act) return notFound('Акт не найден')

  const buf = actToXlsx(act, {
    objectName: act.object.name,
    customer: act.object.customer,
  })
  const fileName = `act-${act.actNo}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
