// GET  /api/price?q=&category= — прайс-лист (поиск по подстроке, фильтр по категории).
// POST /api/price { name, unit, price, category?, section?, source?, sourceDate?, note? } —
// upsert с контролем дрейфа цен: меняя цену, сохраняем «было → стало» и источник.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normName, normalizeUnit } from '@/db/parse'
import { asNumber, asString, badRequest, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const url = new URL(req.url)
  const q = normName(url.searchParams.get('q') ?? '')
  const category = (url.searchParams.get('category') ?? '').trim()
  try {
    const all = await db.priceItem.findMany({ orderBy: { name: 'asc' } })
    const items = all.filter((it) => {
      if (category && it.category !== category) return false
      if (q && !it.name.includes(q) && !q.includes(it.name)) return false
      return true
    })
    return NextResponse.json({ items, count: items.length })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить прайс' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело')
  const nameRaw = asString(body.name) ?? ''
  const unitRaw = asString(body.unit) ?? ''
  const price = asNumber(body.price)
  const category = asString(body.category)?.trim() || 'Прочее'
  const section = asString(body.section)?.trim() || ''
  const source = asString(body.source)?.trim() || 'custom'
  const sourceDate = asString(body.sourceDate)?.trim() || ''
  const note = asString(body.note)

  const name = normName(nameRaw)
  if ([...name].length < 2) return badRequest('Наименование слишком короткое (мин. 2)')
  if ([...name].length > 120) return badRequest('Наименование слишком длинное (макс. 120)')
  if (price === null || price <= 0) return badRequest('Цена должна быть числом больше 0')
  const unit = normalizeUnit(unitRaw) || unitRaw.trim()
  if (category.length > 60) return badRequest('Категория слишком длинная (макс. 60)')

  try {
    const existing = await db.priceItem.findUnique({ where: { name } })
    if (existing) {
      const prev = existing.price
      const changed = Math.abs(prev - price) > 0.005
      await db.priceItem.update({
        where: { name },
        data: {
          price,
          ...(unit ? { unit } : {}),
          ...(section ? { section, category: section } : {}),
          ...(source ? { source } : {}),
          ...(sourceDate ? { sourceDate } : {}),
          ...(note !== null ? { note } : {}),
        },
      })
      const item = await db.priceItem.findUnique({ where: { name } })
      return NextResponse.json({ item, prev, existed: true, changed })
    }
    const item = await db.priceItem.create({
      data: {
        name,
        unit,
        price,
        category,
        ...(section ? { section, category: section } : {}),
        ...(source ? { source } : {}),
        ...(sourceDate ? { sourceDate } : {}),
        ...(note !== null ? { note } : {}),
      },
    })
    return NextResponse.json({ item, prev: 0, existed: false, changed: false })
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить позицию прайса' }, { status: 500 })
  }
}
