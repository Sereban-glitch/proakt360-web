// POST /api/photos — загрузка фото (multipart/form-data).
// Поля: files (один или несколько), objectId (обязателен),
// stageId?, actId?, estimateLineId?, kind?, caption?, takenAt?, visible?
// Файлы сохраняются в db/uploads/ (вне public), доступ — только через API.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { storeUpload } from '@/db/uploads'
import { photoBrief, type PhotoBrief } from '@/db/queries'
import { badRequest, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['progress', 'hidden', 'defect', 'material'])

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('Ожидается multipart/form-data')
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest('Файлы не переданы')
  if (files.length > 10) return badRequest('Максимум 10 файлов за раз')

  const objectId = Number(form.get('objectId'))
  if (!Number.isInteger(objectId) || objectId <= 0) return badRequest('Некорректный objectId')
  const object = await db.buildObject.findUnique({ where: { id: objectId } })
  if (!object) return badRequest('Объект не найден')

  const optNumber = (key: string): number | null => {
    const v = Number(form.get(key))
    if (!Number.isInteger(v) || v <= 0) return null
    return v
  }
  const optString = (key: string): string | null => {
    const v = form.get(key)
    return typeof v === 'string' && v.length > 0 ? v : null
  }

  const stageId = optNumber('stageId')
  const actId = optNumber('actId')
  const estimateLineId = optNumber('estimateLineId')
  let kind = optString('kind') ?? 'progress'
  if (!KINDS.has(kind)) kind = 'progress'
  const caption = optString('caption') ?? ''
  const visibleRaw = form.get('visible')
  const visible = visibleRaw === null ? true : visibleRaw !== 'false'
  const takenAtRaw = optString('takenAt')
  const takenAt = takenAtRaw ? new Date(takenAtRaw) : null
  if (takenAt && Number.isNaN(takenAt.getTime())) return badRequest('Некорректная дата takenAt')

  // валидация привязок к объекту
  if (stageId !== null) {
    const st = await db.stage.findUnique({ where: { id: stageId } })
    if (!st || st.objectId !== objectId) return badRequest('Этап не принадлежит объекту')
  }
  if (actId !== null) {
    const a = await db.act.findUnique({ where: { id: actId } })
    if (!a || a.objectId !== objectId) return badRequest('Акт не принадлежит объекту')
  }
  if (estimateLineId !== null) {
    const l = await db.estimateLine.findUnique({
      where: { id: estimateLineId },
      include: { estimate: { select: { objectId: true } } },
    })
    if (!l || l.estimate.objectId !== objectId) {
      return badRequest('Строка сметы не принадлежит объекту')
    }
  }

  const saved: PhotoBrief[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      const stored = await storeUpload(file)
      const photo = await db.photo.create({
        data: {
          objectId,
          stageId,
          actId,
          estimateLineId,
          kind,
          storage: 'file',
          path: stored.path,
          thumbPath: stored.thumbPath,
          mime: stored.mime,
          size: stored.size,
          width: stored.width,
          height: stored.height,
          caption: files.length === 1 ? caption : caption,
          visible,
          takenAt,
        },
        include: { act: { select: { actNo: true } } },
      })
      saved.push(photoBrief(photo))
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'ошибка'}`)
    }
  }

  if (saved.length === 0) {
    return NextResponse.json({ error: errors.join('; ') || 'Не удалось сохранить файлы' }, { status: 400 })
  }
  return NextResponse.json({ photos: saved, errors })
}
