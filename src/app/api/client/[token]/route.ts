// GET /api/client/[token] — кабинет заказчика (read-only, демо: без авторизации).

import { NextResponse } from 'next/server'
import { getClientCabinet } from '@/db/queries'
import { notFound } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 100) return notFound('Объект не найден')
  try {
    const payload = await getClientCabinet(token)
    if (!payload) return notFound('Объект не найден')
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить кабинет' }, { status: 500 })
  }
}
