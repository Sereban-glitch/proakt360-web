// GET /api/photo/[id]/file?thumb=1&token=... — бинарный файл фото.
// Доступ: мастер (cookie-сессия, если установлен пароль) ИЛИ клиентский токен
// объекта (тогда фото обязано быть visible=true). Файлы лежат в db/uploads/
// вне public — напрямую из веба их не достать.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId } from '@/db/http'
import { readStoredFile } from '@/db/uploads'
import { checkMaster, resolveClientToken } from '@/db/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photoId = parseId(id)
  if (photoId === null) return badRequest('Некорректный id фото')

  const photo = await db.photo.findUnique({
    where: { id: photoId },
    include: { object: { select: { clientToken: true } } },
  })
  if (!photo) return notFound('Фото не найдено')
  if (photo.storage !== 'file' || !photo.path) {
    // legacy SVG v1 — отдадим плейсхолдер напрямую
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img">
  <rect width="800" height="600" fill="#78350f"/>
  <rect x="0" y="488" width="800" height="112" fill="#000" opacity="0.55"/>
  <text x="400" y="551" font-size="24" fill="#fff" text-anchor="middle" font-family="system-ui">${photo.caption.replace(/[<>&]/g, '')}</text>
</svg>`
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
    })
  }

  // проверка доступа
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const thumb = url.searchParams.get('thumb') === '1'

  let allowed = false
  const access = await checkMaster() // мастер: сессия или явный демо-режим (fail-closed)
  if (access.ok) allowed = true
  if (!allowed && token) {
    const resolved = await resolveClientToken(token)
    if (resolved.ok && resolved.objectId === photo.objectId && photo.visible) {
      allowed = true
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Нет доступа к фото' }, { status: 403 })
  }

  try {
    const buf = await readStoredFile(thumb && photo.thumbPath ? photo.thumbPath : photo.path, thumb)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch {
    return notFound('Файл не найден на диске')
  }
}
