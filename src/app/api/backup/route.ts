// GET /api/backup — полный бэкап всех данных в JSON (без фото-файлов:
// файлы лежат в db/uploads/ и копируются отдельно).

import { NextResponse } from 'next/server'
import { makeBackup } from '@/db/queries'
import { requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied
  const data = await makeBackup()
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="proakt360-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
