// GET /api/export/act-text/[id]?lang=ru|uk — текст акта для Telegram.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { actToTelegramText } from '@/db/export'
import { badRequest, notFound, parseId } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actId = parseId(id)
  if (actId === null) return badRequest('Некорректный id')

  const act = await db.act.findUnique({ where: { id: actId }, include: { lines: true } })
  if (!act) return notFound('Акт не найден')

  const url = new URL(req.url)
  const lang = url.searchParams.get('lang') === 'uk' ? 'uk' : 'ru'
  const total = Math.round(act.lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100

  const text = actToTelegramText(
    act.actNo,
    [...act.lines]
      .sort((a, b) => a.pos - b.pos)
      .map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, section: l.section })),
    {
      total,
      periodFrom: act.periodFrom ? act.periodFrom.toISOString() : null,
      periodTo: act.periodTo ? act.periodTo.toISOString() : null,
      lang,
    }
  )
  return new NextResponse(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
