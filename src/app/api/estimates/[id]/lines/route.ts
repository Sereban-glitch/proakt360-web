// POST /api/estimates/[id]/lines — добавить строку (или пачкой { lines: [...] }).

import { NextResponse } from 'next/server'
import type { EstimateLine } from '@prisma/client'
import { db } from '@/lib/db'
import { estimateBrief, roundMoney, ESTIMATE_FULL_INCLUDE } from '@/db/queries'
import { asBool, asNumber, asString, badRequest, notFound, readBody, requireMaster } from '@/db/http'
import { normalizeUnit } from '@/db/parse'

export const dynamic = 'force-dynamic'

interface NewLineInput {
  name: string
  qty: number
  unit: string
  price: number
  hidden: boolean
  done: boolean
  note: string
  section: string
}

const SECTIONS = new Set(['стены', 'потолки', 'доп', 'подготовка'])

function normalizeSection(raw: unknown): string {
  const s = asString(raw)?.trim() ?? ''
  return SECTIONS.has(s) ? s : ''
}

function parseLineInput(raw: Record<string, unknown>): NewLineInput | string {
  const name = asString(raw.name)?.trim() ?? ''
  const qty = asNumber(raw.qty)
  const unitRaw = asString(raw.unit) ?? ''
  const price = asNumber(raw.price)
  const hidden = asBool(raw.hidden) ?? false
  const done = asBool(raw.done) ?? false
  const note = asString(raw.note)?.trim() ?? ''
  if (!name) return 'Укажите наименование работы'
  if (name.length > 300) return 'Наименование слишком длинное (макс. 300)'
  if (qty === null || qty <= 0) return 'Количество должно быть числом больше 0'
  if (price === null || price < 0) return 'Цена должна быть числом ≥ 0'
  if (note.length > 500) return 'Заметка слишком длинная (макс. 500)'
  return {
    name,
    qty,
    unit: normalizeUnit(unitRaw) || unitRaw.trim(),
    price,
    hidden,
    done,
    note,
    section: normalizeSection(raw.section),
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const { id } = await params
  const estId = Number(id)
  if (!Number.isInteger(estId) || estId <= 0) return badRequest('Некорректный id сметы')
  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')

  const raws: Array<Record<string, unknown>> = []
  if (Array.isArray(body.lines)) {
    if (body.lines.length === 0) return badRequest('Список строк пуст')
    if (body.lines.length > 200) return badRequest('Максимум 200 строк за раз')
    for (const l of body.lines) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) return badRequest('Некорректная строка')
      raws.push(l as Record<string, unknown>)
    }
  } else {
    raws.push(body)
  }

  const inputs: NewLineInput[] = []
  for (const raw of raws) {
    const parsed = parseLineInput(raw)
    if (typeof parsed === 'string') return badRequest(parsed)
    inputs.push(parsed)
  }

  try {
    const estimate = await db.estimate.findUnique({ where: { id: estId } })
    if (!estimate) return notFound('Смета не найдена')
    const maxPos = await db.estimateLine.aggregate({
      where: { estimateId: estId },
      _max: { pos: true },
    })
    let pos = (maxPos._max.pos ?? 0) + 1
    const created: Array<EstimateLine & { sum: number }> = []
    for (const input of inputs) {
      const line = await db.estimateLine.create({
        data: {
          estimateId: estId,
          pos: pos++,
          name: input.name,
          qty: input.qty,
          unit: input.unit,
          price: input.price,
          hidden: input.hidden,
          done: input.done,
          note: input.note,
          section: input.section,
        },
      })
      created.push({ ...line, sum: roundMoney(line.qty * line.price) })
    }
    const full = await db.estimate.findUnique({ where: { id: estId }, include: ESTIMATE_FULL_INCLUDE })
    if (!full) return notFound('Смета не найдена')
    return NextResponse.json({ added: created.length, estimate: estimateBrief(full), lines: created })
  } catch {
    return NextResponse.json({ error: 'Не удалось добавить строки' }, { status: 500 })
  }
}
