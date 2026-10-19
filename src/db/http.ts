// Мелкие хелперы для API-роутов: JSON-ответы, разбор тел, валидация чисел,
// origin-проверка (защита изменения состояния) и мастерский guard.

import { NextResponse } from 'next/server'
import { checkMaster, demoOpenMode } from './auth'

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function badRequest(message: string): NextResponse {
  return jsonError(400, message)
}

export function notFound(message = 'Не найдено'): NextResponse {
  return jsonError(404, message)
}

export function readBody(req: Request): Promise<Record<string, unknown> | null> {
  return req
    .json()
    .then((v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null))
    .catch(() => null)
}

/** Число из JSON (строки «12,5» тоже понимаем); null — не число. */
export function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/** Позитивный целый id из сегмента пути; null — некорректный. */
export function parseId(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Защита изменения состояния (CSRF): для не-GET запросов сверяем Origin
 * с Host (включая x-forwarded-host за прокси). Отсутствие Origin
 * допускается — не-браузерные клиенты (curl, скрипты) не полагаются на
 * cookie-сессии так, как браузеры, а SameSite=Lax закрывает базовые
 * векторы. Файлы cookie при этом остаются HttpOnly.
 */
export function sameOrigin(req?: Request): boolean {
  if (!req) return true
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('x-forwarded-host')?.split(',')[0].trim() || req.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Guard для мастерских роутов — FAIL-CLOSED:
 *  503 — пароль не задан и демо-режим не включён (сервер не настроен);
 *  401 — пароль задан, но нет сессии;
 *  403 — запрос изменения состояния пришёл с чужого Origin.
 * Возвращает NextResponse при запрете; null — если доступ разрешён.
 * Передавайте req, чтобы включалась origin-проверка не-GET запросов.
 */
export async function requireMaster(req?: Request): Promise<NextResponse | null> {
  if (!sameOrigin(req)) {
    return jsonError(403, 'Запрос отклонён: источник не совпадает (origin)')
  }
  const access = await checkMaster()
  if (!access.ok) {
    return jsonError(access.status, access.error)
  }
  return null
}
