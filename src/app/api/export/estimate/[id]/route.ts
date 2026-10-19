// GET /api/export/estimate/[id] — смета в XLSX.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { estimateToXlsx } from '@/db/export'
import { badRequest, notFound, parseId, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied
  const { id } = await params
  const estId = parseId(id)
  if (estId === null) return badRequest('Некорректный id')

  const estimate = await db.estimate.findUnique({
    where: { id: estId },
    include: {
      ...ESTIMATE_FULL_INCLUDE,
      object: { select: { name: true, customer: true } },
    },
  })
  if (!estimate) return notFound('Смета не найдена')

  const buf = estimateToXlsx(estimate, {
    objectName: estimate.object.name,
    customer: estimate.object.customer,
  })
  const fileName = `estimate-${estimate.id}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
