// POST /api/auth/login {password} → HttpOnly cookie сессии (30 дней).
//
// Защита:
//  • rate limit: 5 попыток с одного IP за 15 минут, дальше 429 + Retry-After
//    (в памяти процесса — приложение одноинстансовое, как и SQLite);
//  • при HTTPS (x-forwarded-proto или PROAKT_FORCE_SECURE_COOKIES) cookie
//    помечается Secure;
//  • ненастроенный сервер (пароль не задан, демо-режим не включён)
//    отвечает 403 и НЕ позволяет удалённо «войти» или захватить настройку.

import { NextResponse } from 'next/server'
import { verifyPassword, createSession, getSettings, SESSION_COOKIE, demoOpenMode, SETUP_ERROR } from '@/db/auth'
import { badRequest, readBody, sameOrigin } from '@/db/http'
import { rateLimit, clientIp } from '@/db/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

function secureCookie(req: Request): boolean {
  if (process.env.PROAKT_FORCE_SECURE_COOKIES === '1') return true
  const proto = (req.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim()
  return proto === 'https'
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'Запрос отклонён: источник не совпадает (origin)' }, { status: 403 })
  }

  const ip = clientIp(req)
  const verdict = rateLimit(`login:${ip}`, MAX_ATTEMPTS, WINDOW_MS)
  if (!verdict.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Подождите немного и попробуйте снова.' },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } },
    )
  }

  const body = await readBody(req)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (password.length === 0) return badRequest('Введите пароль')

  const settings = await getSettings()
  if (!settings.passHash) {
    // сервер не настроен: демо-режим без пароля или явный отказ
    if (demoOpenMode()) {
      return NextResponse.json({ ok: true, authRequired: false, demoOpen: true })
    }
    return NextResponse.json({ error: SETUP_ERROR }, { status: 403 })
  }

  const valid = await verifyPassword(password)
  if (!valid) {
    // небольшая постоянная задержка сглаживает тайминги, но НЕ заменяет
    // rate limit — он включён выше
    await new Promise((r) => setTimeout(r, 400))
    return NextResponse.json(
      { error: 'Неверный пароль' },
      { status: 401, headers: { 'Retry-After': String(verdict.remaining > 0 ? 0 : 60) } },
    )
  }

  const token = await createSession()
  const res = NextResponse.json({ ok: true, authRequired: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    secure: secureCookie(req),
  })
  return res
}
