// POST /api/parse-line { text } — предпросмотр распознанных позиций ДО добавления:
// «штукатурка 45 м² 260» / «демонтаж 2000» / «45м» / «м2»→«м²» / «грн» / список через запятую.

import { NextResponse } from 'next/server'
import { parseLineText } from '@/db/parse'
import { asString, badRequest, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const text = asString(body.text)?.trim() ?? ''
  if (!text) return badRequest('Строка пуста')
  if (text.length > 500) return badRequest('Строка слишком длинная (макс. 500)')
  return NextResponse.json(parseLineText(text))
}
