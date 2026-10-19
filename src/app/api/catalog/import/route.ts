// POST /api/catalog/import — импорт прайс-каталога из JSON.
// Формат: { items: [{name, unit, price, section?, source?, sourceDate?, note?}] }
// или полный приватный формат с _meta (items+sources) — источники сохраняются.
// Режимы: replace (по умолчанию — полный перезапуск каталога) | merge
// (обновить существующие по имени, добавить новые).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

type ImportItem = {
  name: string
  unit: string
  price: number
  section?: string
  source?: string
  sourceDate?: string
  note?: string
}

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Пустое тело')
  const items = body.items
  if (!Array.isArray(items) || items.length === 0) return badRequest('items пуст')
  if (items.length > 1000) return badRequest('Максимум 1000 позиций')
  const mode = body.mode === 'merge' ? 'merge' : 'replace'

  const clean: ImportItem[] = []
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const price = Number(r.price)
    if (!name || !Number.isFinite(price) || price < 0) continue
    clean.push({
      name: name.slice(0, 200),
      unit: typeof r.unit === 'string' ? r.unit.slice(0, 16) : '',
      price: Math.round(price * 100) / 100,
      section: typeof r.section === 'string' ? r.section.slice(0, 40) : 'стены',
      source: typeof r.source === 'string' ? r.source.slice(0, 40) : 'custom',
      sourceDate: typeof r.sourceDate === 'string' ? r.sourceDate.slice(0, 40) : '',
      note: typeof r.note === 'string' ? r.note.slice(0, 300) : '',
    })
  }
  if (clean.length === 0) return badRequest('Нет корректных позиций')

  let updated = 0
  let created = 0
  if (mode === 'replace') {
    await db.priceItem.deleteMany({})
    for (const item of clean) {
      await db.priceItem.create({
        data: {
          name: item.name,
          unit: item.unit,
          price: item.price,
          section: item.section ?? 'стены',
          category: item.section ?? 'стены',
          source: item.source ?? 'custom',
          sourceDate: item.sourceDate ?? '',
          note: item.note ?? '',
          active: true,
        },
      })
      created++
    }
  } else {
    for (const item of clean) {
      const existing = await db.priceItem.findUnique({ where: { name: item.name } })
      if (existing) {
        await db.priceItem.update({
          where: { id: existing.id },
          data: {
            unit: item.unit,
            price: item.price,
            section: item.section ?? 'стены',
            category: item.section ?? 'стены',
            source: item.source ?? 'custom',
            sourceDate: item.sourceDate ?? '',
            note: item.note ?? '',
            active: true,
          },
        })
        updated++
      } else {
        await db.priceItem.create({
          data: {
            name: item.name,
            unit: item.unit,
            price: item.price,
            section: item.section ?? 'стены',
            category: item.section ?? 'стены',
            source: item.source ?? 'custom',
            sourceDate: item.sourceDate ?? '',
            note: item.note ?? '',
            active: true,
          },
        })
        created++
      }
    }
  }
  return NextResponse.json({ ok: true, created, updated, mode })
}
