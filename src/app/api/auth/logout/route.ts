// POST /api/auth/logout — удаляет сессию и чистит cookie.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { dropSession, SESSION_COOKIE } from '@/db/auth'
import { sameOrigin } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'Запрос отклонён: источник не совпадает (origin)' }, { status: 403 })
  }
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await dropSession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
