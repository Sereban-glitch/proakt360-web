// GET/PUT /api/settings — язык, имя мастера, компания, пароль.
// PUT требует сессию, если пароль установлен.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings, setPassword, verifyPassword } from '@/db/auth'
import { badRequest, readBody, requireMaster, asString } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSettings()
  return NextResponse.json({
    lang: s.lang,
    masterName: s.masterName,
    companyName: s.companyName,
    hasPassword: s.passHash.length > 0,
  })
}

export async function PUT(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Пустое тело')

  const data: Record<string, string> = {}
  const lang = asString(body.lang)
  if (lang !== null) {
    if (lang !== 'ru' && lang !== 'uk') return badRequest('lang: ru | uk')
    data.lang = lang
  }
  const masterName = asString(body.masterName)
  if (masterName !== null) data.masterName = masterName.slice(0, 80)
  const companyName = asString(body.companyName)
  if (companyName !== null) data.companyName = companyName.slice(0, 120)

  // Смена/установка пароля: {newPassword, oldPassword?}; {removePassword:true} — снять пароль
  const newPassword = asString(body.newPassword)
  const removePassword = body.removePassword === true
  if (newPassword !== null || removePassword) {
    const s = await getSettings()
    if (s.passHash) {
      const oldPassword = asString(body.oldPassword) ?? ''
      if (!(await verifyPassword(oldPassword))) {
        return NextResponse.json({ error: 'Старый пароль неверен' }, { status: 403 })
      }
    }
    if (removePassword) {
      await db.appSettings.update({ where: { id: 1 }, data: { passSalt: '', passHash: '' } })
      await db.session.deleteMany({})
    } else if (newPassword !== null) {
      if (newPassword.length < 6) return badRequest('Пароль минимум 6 символов')
      if (newPassword.length > 100) return badRequest('Пароль слишком длинный')
      await setPassword(newPassword)
    }
  }

  if (Object.keys(data).length > 0) {
    await db.appSettings.update({ where: { id: 1 }, data })
  }
  const s = await db.appSettings.findUnique({ where: { id: 1 } })
  return NextResponse.json({
    ok: true,
    lang: s?.lang ?? 'ru',
    masterName: s?.masterName ?? '',
    companyName: s?.companyName ?? '',
    hasPassword: (s?.passHash ?? '').length > 0,
  })
}
