// GET /api/dashboard — рабочий стол мастера: статистика, долги, свежие акты.

import { NextResponse } from 'next/server'
import { getDashboard } from '@/db/queries'

export const dynamic = 'force-dynamic'

import { requireMaster } from '@/db/http'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  try {
    const payload = await getDashboard()
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить дашборд' }, { status: 500 })
  }
}
