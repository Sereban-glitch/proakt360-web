// GET /api/auth/me — состояние входа для гейта фронтенда:
// {authRequired, authed, configured, demoOpen, lang, masterName, companyName}.
// configured=false && demoOpen=false → экран первичной настройки (fail-closed).

import { NextResponse } from 'next/server'
import { getSessionUser, getSettings } from '@/db/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [me, s] = await Promise.all([getSessionUser(), getSettings()])
  return NextResponse.json({
    authRequired: me.required,
    authed: me.authed,
    configured: me.configured,
    demoOpen: me.demoOpen,
    lang: s.lang,
    masterName: s.masterName,
    companyName: s.companyName,
  })
}
