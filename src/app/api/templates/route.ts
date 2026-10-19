// GET  /api/templates — шаблоны работ (lines уже распарсены из JSON).
// POST /api/templates { name, lines: [{name,qty,unit,price,hidden}] } — upsert по имени.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { asBool, asNumber, asString, badRequest, readBody, requireMaster } from '@/db/http'
import { normalizeUnit } from '@/db/parse'

export const dynamic = 'force-dynamic'

export interface TemplateLine {
  name: string
  qty: number
  unit: string
  price: number
  hidden: boolean
}

export interface TemplateItem {
  id: number
  name: string
  lines: TemplateLine[]
}

function withParsedLines(raw: { id: number; name: string; lines: string }): TemplateItem {
  let parsed: TemplateLine[] = []
  try {
    const v: unknown = JSON.parse(raw.lines)
    if (Array.isArray(v)) parsed = v as TemplateLine[]
  } catch {
    parsed = []
  }
  return { id: raw.id, name: raw.name, lines: parsed }
}

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  try {
    const rows = await db.template.findMany({ orderBy: { name: 'asc' } })
    const items = rows.map(withParsedLines)
    return NextResponse.json({ items, count: items.length })
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить шаблоны' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const name = asString(body.name)?.trim() ?? ''
  if (!name) return badRequest('Укажите название шаблона')
  if (name.length > 200) return badRequest('Название слишком длинное (макс. 200)')
  if (!Array.isArray(body.lines) || body.lines.length === 0) return badRequest('Шаблон без строк')
  if (body.lines.length > 100) return badRequest('Максимум 100 строк в шаблоне')

  const lines: TemplateLine[] = []
  for (const raw of body.lines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return badRequest('Некорректная строка шаблона')
    const l = raw as Record<string, unknown>
    const lineName = asString(l.name)?.trim() ?? ''
    const qty = asNumber(l.qty)
    const price = asNumber(l.price)
    if (!lineName) return badRequest('У каждой строки должно быть наименование')
    if (qty === null || qty <= 0) return badRequest('Количество должно быть числом больше 0')
    if (price === null || price < 0) return badRequest('Цена должна быть числом ≥ 0')
    const unitRaw = asString(l.unit) ?? ''
    lines.push({
      name: lineName,
      qty,
      unit: normalizeUnit(unitRaw) || unitRaw.trim(),
      price,
      hidden: asBool(l.hidden) ?? false,
    })
  }

  try {
    const existing = await db.template.findUnique({ where: { name } })
    const row = existing
      ? await db.template.update({ where: { name }, data: { lines: JSON.stringify(lines) } })
      : await db.template.create({ data: { name, lines: JSON.stringify(lines) } })
    return NextResponse.json(withParsedLines(row))
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить шаблон' }, { status: 500 })
  }
}
