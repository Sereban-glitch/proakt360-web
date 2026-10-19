// /api/photo/[id] — управление метаданными фото: PATCH (подпись, видимость,
// привязки, дата), DELETE (запись + файлы). GET — редирект на file для
// legacy-ссылок (SVG-фото v1 отдавались прямо здесь).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, notFound, parseId, readBody, requireMaster, asString, asBool } from '@/db/http'
import { removeStoredFiles, readStoredFile } from '@/db/uploads'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['progress', 'hidden', 'defect', 'material'])

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photoId = parseId(id)
  if (photoId === null) return badRequest('Некорректный id фото')
  const photo = await db.photo.findUnique({ where: { id: photoId } })
  if (!photo) return notFound('Фото не найдено')
  if (photo.storage === 'file' && photo.path) {
    return NextResponse.redirect(new URL(`/api/photo/${photo.id}/file`, req.url))
  }
  // legacy SVG v1 — отдаём упрощённый плейсхолдер
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img">
  <rect width="800" height="600" fill="#78350f"/>
  <rect x="0" y="488" width="800" height="112" fill="#000" opacity="0.55"/>
  <text x="400" y="551" font-size="24" fill="#fff" text-anchor="middle" font-family="system-ui">${photo.caption || 'фото'}</text>
</svg>`
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied
  const { id } = await params
  const photoId = parseId(id)
  if (photoId === null) return badRequest('Некорректный id фото')

  const body = await readBody(req)
  if (!body) return badRequest('Пустое тело')

  const photo = await db.photo.findUnique({ where: { id: photoId } })
  if (!photo) return notFound('Фото не найдено')

  const data: Record<string, unknown> = {}
  const caption = asString(body.caption)
  if (caption !== null) data.caption = caption.slice(0, 300)
  const visible = asBool(body.visible)
  if (visible !== null) data.visible = visible
  const kind = asString(body.kind)
  if (kind !== null) {
    if (!KINDS.has(kind)) return badRequest('kind: progress | hidden | defect | material')
    data.kind = kind
  }
  const takenAt = asString(body.takenAt)
  if (takenAt !== null) {
    if (takenAt === '') data.takenAt = null
    else {
      const d = new Date(takenAt)
      if (Number.isNaN(d.getTime())) return badRequest('Некорректная дата')
      data.takenAt = d
    }
  }
  const stageId = body.stageId
  if (stageId === null) data.stageId = null
  else if (typeof stageId === 'number' && Number.isInteger(stageId) && stageId > 0) {
    const st = await db.stage.findUnique({ where: { id: stageId } })
    if (!st || st.objectId !== photo.objectId) return badRequest('Этап не принадлежит объекту')
    data.stageId = stageId
  }
  const actId = body.actId
  if (actId === null) data.actId = null
  else if (typeof actId === 'number' && Number.isInteger(actId) && actId > 0) {
    const a = await db.act.findUnique({ where: { id: actId } })
    if (!a || a.objectId !== photo.objectId) return badRequest('Акт не принадлежит объекту')
    data.actId = actId
  }
  const lineId = body.estimateLineId
  if (lineId === null) data.estimateLineId = null
  else if (typeof lineId === 'number' && Number.isInteger(lineId) && lineId > 0) {
    const l = await db.estimateLine.findUnique({
      where: { id: lineId },
      include: { estimate: { select: { objectId: true } } },
    })
    if (!l || l.estimate.objectId !== photo.objectId) return badRequest('Строка не принадлежит объекту')
    data.estimateLineId = lineId
  }

  if (Object.keys(data).length === 0) return badRequest('Нет изменений')
  const updated = await db.photo.update({
    where: { id: photoId },
    data,
    include: { act: { select: { actNo: true } } },
  })
  return NextResponse.json({
    ok: true,
    photo: { id: updated.id, caption: updated.caption, visible: updated.visible, kind: updated.kind },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied
  const { id } = await params
  const photoId = parseId(id)
  if (photoId === null) return badRequest('Некорректный id фото')
  const photo = await db.photo.findUnique({ where: { id: photoId } })
  if (!photo) return notFound('Фото не найдено')
  await db.photo.delete({ where: { id: photoId } })
  if (photo.storage === 'file' && photo.path) {
    await removeStoredFiles([photo.path])
  }
  return NextResponse.json({ ok: true })
}
