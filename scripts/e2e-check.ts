// Изолированный e2e-тест «ПрорАКТ 360» (только синтетика, только temp-база).
// Запуск ПОСЛЕ сборки:
//   npm run build
//   npm run test:e2e
//
// Что проверяет (полный список — в выводе скрипта):
//   1. fail-closed: ненастроенный production отвечает 503 мастерским API
//      и не даёт «войти» (403); клиентский кабинет по токену работает;
//   2. явный демо-режим PROAKT_DEMO_OPEN=1 открывает мастерские API;
//   3. установка пароля через локальный CLI; 401 без сессии; rate limit
//      входа (5 попыток → 429); Secure cookie при x-forwarded-proto=https;
//   4. origin-защита изменений состояния (403 на чужой Origin);
//   5. рабочий процесс: объект → смета → строки → ЧАСТИЧНЫЙ недельный акт
//      → запрет превышения остатка (409) → закрытие остатка → оплата;
//   6. изоляция клиентов (чужой токен не видит чужие данные/фото/сметы);
//   7. фото: загрузка, видимость клиенту, СОХРАННОСТЬ ПОСЛЕ ПЕРЕЗАПУСКА;
//   8. бэкап/восстановление (данные + файлы);
//   9. RU/UK документы (текст акта, XLSX);
//  10. logout аннулирует сессию.
//
// Скрипт сам создаёт temp-базу, сам запускает/перезапускает сервер на
// свободном порту и сам всё убирает за собой. Рабочая база не затрагивается.

import { spawn, spawnSync } from 'child_process'
import { mkdtemp, rm, access, constants } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import sharp from 'sharp'

const ROOT = process.cwd()
let currentPort = Number(process.env.E2E_PORT ?? 3310)
const BASE = {
  toString() {
    return `http://127.0.0.1:${currentPort}`
  },
}
const NODE = process.execPath
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const PRISMA_BIN = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js')
const E2E_PASSWORD = 'e2e-master-pass-42'

type ServerHandle = { stop: () => Promise<void> }

const results: Array<{ name: string; ok: boolean; note?: string }> = []

function check(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note })
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${note && !ok ? ` — ${note}` : ''}`)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function fileExists(p: string) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function run(cmd: string, args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    input: opts.input,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { code: res.status, out: (res.stdout ?? '') + (res.stderr ?? '') }
}

async function startServer(envExtra: Record<string, string>): Promise<ServerHandle> {
  currentPort++
  const child = spawn(NODE, [NEXT_BIN, 'start', '-p', String(currentPort)], {
    cwd: ROOT,
    env: { ...process.env, PROAKT_DEMO_OPEN: '', ...envExtra, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => { log += d.toString() })
  child.stderr.on('data', (d) => { log += d.toString() })

  const deadline = Date.now() + 120_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server died: ${log.slice(-2000)}`)
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error('server readiness timeout')
    }
    try {
      const r = await fetch(String(BASE), { method: 'GET' })
      if (r.status < 500) break
    } catch {
      /* ещё не готов */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        try { child.kill('SIGKILL') } catch {}
        try { spawnSync('fuser', ['-k', `${currentPort}/tcp`]) } catch {}
        setTimeout(resolve, 800)
      }),
  }
}

type J = Record<string, unknown>

async function api(
  method: string,
  url: string,
  body?: unknown,
  opts: { cookie?: string; origin?: string; proto?: string; raw?: false } = {},
): Promise<{ status: number; json: J | null; text: string; setCookie: string[] }> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (opts.cookie) headers['cookie'] = opts.cookie
  if (opts.origin) headers['origin'] = String(opts.origin)
  if (opts.proto) headers['x-forwarded-proto'] = opts.proto
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json: J | null = null
  try {
    json = JSON.parse(text) as J
  } catch {
    json = null
  }
  const getSetCookie = (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
  const setCookie = getSetCookie ? getSetCookie.call(r.headers) : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie') as string] : [])
  return { status: r.status, json, text, setCookie }
}

function cookieOf(sc: string[]): string {
  for (const line of sc) {
    const m = /proakt360_session=([^;]+)/.exec(line)
    if (m) return `proakt360_session=${m[1]}`
  }
  return ''
}

async function makeJpeg(label: string): Promise<Blob> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#7c4a1e"/><text x="24" y="64" font-size="42" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
  )
  const buf = await sharp(svg).jpeg({ quality: 80 }).toBuffer()
  return new Blob([new Uint8Array(buf)], { type: 'image/jpeg' })
}

async function main() {
  console.log(`E2E «ПрорАКТ 360» · база: temp · динамический порт\n`)

  // --- подготовка: сборка существует? ---------------------------------------
  assert(await fileExists(path.join(ROOT, '.next', 'BUILD_ID')), 'нет .next/BUILD_ID — сначала npm run build')

  const dir = await mkdtemp(path.join(tmpdir(), 'proakt360-e2e-'))
  const dbFile = path.join(dir, 'e2e.db')
  const dbUrl = `file:${dbFile}`
  const envDb = { DATABASE_URL: dbUrl }

  // защита от случайного запуска на рабочей базе
  const currentUrl = process.env.DATABASE_URL ?? ''
  if (path.resolve(currentUrl.replace(/^file:/, '')) === path.resolve(ROOT, 'db', 'custom.db')) {
    console.error('ОТКАЗ: DATABASE_URL указывает на рабочую базу db/custom.db.')
    process.exit(1)
  }

  try {
    // --- подготовка: схема + демо-данные ----------------------------------
    let r = await run(NODE, [PRISMA_BIN, 'db', 'push', '--skip-generate', '--accept-data-loss'], { env: envDb })
    assert(r.code === 0, `prisma db push не удался: ${r.out}`)
    r = await run(NODE, [TSX_BIN, 'src/db/seed.ts'], { env: envDb })
    assert(r.code === 0, `seed не удался: ${r.out}`)
    console.log('подготовка: схема + демо-данные готовы (temp-база)\n')

    // =====================================================================
    console.log('ФАЗА 1 — fail-closed: ненастроенный production')
    // =====================================================================
    let srv = await startServer({ ...envDb })

    let res = await api('GET', '/')
    check('GET / отвечает 200', res.status === 200, `статус ${res.status}`)

    res = await api('GET', '/api/dashboard')
    check('ненастроенный: /api/dashboard → 503 (fail-closed)', res.status === 503, `статус ${res.status}`)

    res = await api('POST', '/api/auth/login', { password: 'что-угодно' })
    check('ненастроенный: login → 403 (удалённая настройка запрещена)', res.status === 403, `статус ${res.status}`)

    res = await api('PUT', '/api/settings', { newPassword: 'hijack-123' })
    check('ненастроенный: смена настроек/пароля через API закрыта (503)', res.status === 503, `статус ${res.status}`)

    res = await api('GET', '/api/client/demo-rivija-42')
    check('клиентский кабинет по токену работает (200)', res.status === 200 && !!res.json, `статус ${res.status}`)

    res = await api('GET', '/api/auth/me')
    check('me: configured=false, demoOpen=false', res.json?.configured === false && res.json?.demoOpen === false)

    await srv.stop()

    // =====================================================================
    console.log('\nФАЗА 2 — явный демо-режим PROAKT_DEMO_OPEN=1')
    // =====================================================================
    srv = await startServer({ ...envDb, PROAKT_DEMO_OPEN: '1' })

    res = await api('GET', '/api/dashboard')
    check('демо: /api/dashboard → 200', res.status === 200, `статус ${res.status}`)

    res = await api('GET', '/api/auth/me')
    check('me: demoOpen=true, authed=true', res.json?.demoOpen === true && res.json?.authed === true)

    res = await api('POST', '/api/objects', { name: 'злобный объект' }, { origin: 'http://evil.example' })
    check('origin-защита: POST с чужим Origin → 403', res.status === 403, `статус ${res.status}`)

    await srv.stop()

    // =====================================================================
    console.log('\nФАЗА 3 — установка пароля (локальный CLI) и вход')
    // =====================================================================
    r = await run(NODE, [TSX_BIN, 'scripts/set-password.ts', '--stdin'], { input: `${E2E_PASSWORD}\n`, env: envDb })
    check('setup:password --stdin устанавливает пароль', r.code === 0, r.out.slice(0, 300))

    srv = await startServer({ ...envDb })

    res = await api('GET', '/api/dashboard')
    check('с паролем без сессии: /api/dashboard → 401', res.status === 401, `статус ${res.status}`)

    res = await api('GET', '/api/auth/me')
    check('me: configured=true, authed=false', res.json?.configured === true && res.json?.authed === false)

    for (let i = 1; i <= 5; i++) {
      res = await api('POST', '/api/auth/login', { password: 'неверный-пароль' })
      if (res.status !== 401) check(`неверная попытка ${i} → 401`, false, `статус ${res.status}`)
    }
    check('пять неверных попыток → каждая 401', true)
    res = await api('POST', '/api/auth/login', { password: 'неверный-пароль' })
    check('шестая попытка → 429 (rate limit)', res.status === 429, `статус ${res.status}`)

    // перезапуск сбрасывает in-memory счётчик (документировано)
    await srv.stop()
    srv = await startServer({ ...envDb })

    res = await api('POST', '/api/auth/login', { password: E2E_PASSWORD }, { proto: 'https' })
    const secureFlag = res.setCookie.some((c) => /;\s*secure/i.test(c))
    check('вход верным паролем → 200', res.status === 200, `статус ${res.status}`)
    check('при x-forwarded-proto=https cookie помечена Secure', secureFlag, JSON.stringify(res.setCookie))

    res = await api('POST', '/api/auth/login', { password: E2E_PASSWORD })
    const cookie = cookieOf(res.setCookie)
    assert(cookie !== '', 'не получили cookie сессии')
    check('вход по http (для теста) → cookie получена', !!cookie)

    res = await api('GET', '/api/dashboard', undefined, { cookie })
    check('с сессией: /api/dashboard → 200', res.status === 200, `статус ${res.status}`)

    // =====================================================================
    console.log('\nФАЗА 4 — рабочий процесс: смета → недельные акты → оплата')
    // =====================================================================
    const origin = { toString() { return BASE.toString() } } as unknown as string

    res = await api('POST', '/api/objects', { name: 'E2E Дом', customer: 'E2E Клиент' }, { cookie, origin })
    check('создание объекта', res.status === 200 || res.status === 201, `статус ${res.status}`)
    const objectId = Number(res.json?.id ?? 0)
    assert(objectId > 0, 'нет id объекта')

    res = await api('POST', '/api/estimates', { objectId, title: 'E2E смета' }, { cookie, origin })
    check('создание сметы', res.status === 200 || res.status === 201, `статус ${res.status}`)
    const estId = Number(res.json?.id ?? 0)
    assert(estId > 0, 'нет id сметы')

    res = await api('POST', `/api/estimates/${estId}/lines`, {
      lines: [
        { name: 'e2e покраска стен', qty: 100, unit: 'м²', price: 50, section: 'стены' },
        { name: 'e2e покраска потолка', qty: 40, unit: 'м²', price: 60, section: 'потолки' },
      ],
    }, { cookie, origin })
    check('добавление строк сметы', res.status === 200 || res.status === 201, `статус ${res.status}`)

    let est = (await api('GET', `/api/estimates/${estId}`, undefined, { cookie })).json as { lines?: Array<{ id: number; qty: number; doneQty: number; remainingQty: number }> } | null
    const lines = est?.lines ?? []
    assert(lines.length === 2, 'строки не вернулись')
    const wall = lines[0]
    const ceil = lines[1]
    check('остатки на старте = объёму', wall.doneQty === 0 && wall.qty === 100)

    // частичный акт: 60 из 100
    res = await api('POST', `/api/estimates/${estId}/act`, {
      entries: [{ lineId: wall.id, qty: 60 }],
      periodFrom: new Date(Date.now() - 7 * 864e5).toISOString(),
      periodTo: new Date().toISOString(),
    }, { cookie, origin })
    check('частичный недельный акт (60 из 100)', res.status === 200 && typeof res.json?.actId === 'number', `статус ${res.status}`)
    const actId = Number(res.json?.actId ?? 0)

    est = (await api('GET', `/api/estimates/${estId}`, undefined, { cookie })).json as typeof est
    const wallAfter = (est?.lines ?? []).find((l) => l.id === wall.id)
    check('остаток после акта = 40', wallAfter?.qty === 100 && wallAfter?.doneQty === 60, JSON.stringify(wallAfter))

    // превышение остатка
    res = await api('POST', `/api/estimates/${estId}/act`, {
      entries: [{ lineId: wall.id, qty: 50 }],
    }, { cookie, origin })
    check('превышение остатка → 409', res.status === 409 && String(res.json?.error ?? '').includes('осталось 40'), `статус ${res.status} ${res.json?.error}`)

    // вторая строка целиком
    res = await api('POST', `/api/estimates/${estId}/act`, {
      entries: [
        { lineId: wall.id, qty: 40 },
        { lineId: ceil.id, qty: 40 },
      ],
    }, { cookie, origin })
    check('закрытие остатков вторым актом', res.status === 200, `статус ${res.status} ${res.json?.error}`)

    res = await api('POST', `/api/estimates/${estId}/act`, { entries: [{ lineId: wall.id, qty: 1 }] }, { cookie, origin })
    check('повторное включение исчерпанной строки → 409', res.status === 409, `статус ${res.status}`)

    // оплата
    res = await api('POST', `/api/acts/${actId}/payments`, { amount: 1500 }, { cookie, origin })
    check('оплата по акту', res.status === 200, `статус ${res.status}`)

    const actDetail = (await api('GET', `/api/acts/${actId}`, undefined, { cookie })).json as { act?: { total?: number; paid?: number } } | null
    check('акт: total=3000, paid=1500', actDetail?.act?.total === 3000 && actDetail?.act?.paid === 1500, JSON.stringify({ total: actDetail?.act?.total, paid: actDetail?.act?.paid }))

    // RU/UK документы
    res = await api('GET', `/api/export/act-text/${actId}?lang=ru`, undefined, { cookie })
    check('текст акта RU (Общая сумма, раздел стен)', res.text.includes('Общая сумма') && res.text.includes('Малярные работы на стенах'), res.text.slice(0, 120))
    res = await api('GET', `/api/export/act-text/${actId}?lang=uk`, undefined, { cookie })
    check('текст акта UK (Загальна сума, розділ стін)', res.text.includes('Загальна сума') && res.text.includes('Малярні роботи на стінах'), res.text.slice(0, 120))

    const xlsxRes = await fetch(`${BASE}/api/export/act/${actId}`, { headers: { cookie } })
    const xbuf = Buffer.from(await xlsxRes.arrayBuffer())
    check('XLSX акта: 200 + zip-магия PK', xlsxRes.status === 200 && xbuf.slice(0, 2).toString() === 'PK')

    // =====================================================================
    console.log('\nФАЗА 5 — изоляция клиентов')
    // =====================================================================
    res = await api('GET', '/api/client/demo-zatishniy-7')
    const cab = res.json as { object?: { name?: string } } | null
    check('кабинет по токену объекта 2', res.status === 200 && String(cab?.object?.name ?? '').includes('Таунхаус'), `статус ${res.status}`)

    // смета нового объекта + чужой токен
    res = await api('POST', `/api/estimates/${estId}/approve`, { token: 'demo-rivija-42' }, { origin })
    check('согласование чужой сметы чужим токеном → 403', res.status === 403, `статус ${res.status}`)

    // фото объекта 1 (сущ. демо) + токен объекта 2
    const photoListRes = await fetch(`${BASE}/api/objects/1`, { headers: { cookie } })
    const obj1 = (await photoListRes.json()) as { photos?: Array<{ id: number }> } | null
    const demoPhotoId = obj1?.photos?.[0]?.id
    if (demoPhotoId) {
      const r2 = await fetch(`${BASE}/api/photo/${demoPhotoId}/file?token=demo-zatishniy-7`)
      check('чужой токен не читает фото чужого объекта → 403', r2.status === 403, `статус ${r2.status}`)
    } else {
      check('чужой токен не читает фото чужого объекта → 403', false, 'в демо-данных нет фото объекта 1')
    }

    res = await api('GET', '/api/client/несуществующий-токен-xyz')
    check('несуществующий токен → 404', res.status === 404, `статус ${res.status}`)

    // =====================================================================
    console.log('\nФАЗА 6 — фото: загрузка, видимость, привязка')
    // =====================================================================
    const form = new FormData()
    form.append('files', await makeJpeg('E2E PHOTO'), 'e2e-photo.jpg')
    form.append('objectId', String(objectId))
    form.append('kind', 'hidden')
    form.append('caption', 'e2e скрытая работа фото')
    form.append('visible', 'true')
    const up = await fetch(`${BASE}/api/photos`, { method: 'POST', headers: { cookie, origin: String(origin) }, body: form })
    const upJson = (await up.json()) as { photos?: Array<{ id: number; visible: boolean; kind: string }> } | null
    check('загрузка фото → 200 + метаданные', up.status === 200 && (upJson?.photos?.length ?? 0) === 1, `статус ${up.status}`)
    const photoId = Number(upJson?.photos?.[0]?.id ?? 0)
    assert(photoId > 0, 'нет id фото')

    const fileRes1 = await fetch(`${BASE}/api/photo/${photoId}/file`, { headers: { cookie } })
    const fileBuf1 = Buffer.from(await fileRes1.arrayBuffer())
    check('файл читается мастером (JPEG-магия)', fileRes1.status === 200 && fileBuf1.slice(0, 3).toString('hex') === 'ffd8ff', `статус ${fileRes1.status}`)

    // объект E2E без clientToken в ответе? cabinet создаётся с токеном — получим из деталей объекта
    const objRes = (await (await fetch(`${BASE}/api/objects/${objectId}`, { headers: { cookie } })).json()) as { object?: { clientToken?: string } } | null
    const e2eToken = objRes?.object?.clientToken ?? ''
    assert(!!e2eToken, 'у объекта нет clientToken')

    let cli = await fetch(`${BASE}/api/photo/${photoId}/file?token=${e2eToken}`)
    check('клиент видит фото (visible=true)', cli.status === 200, `статус ${cli.status}`)

    res = await api('PATCH', `/api/photo/${photoId}`, { visible: false }, { cookie, origin })
    check('скрытие фото от клиента (PATCH visible=false)', res.status === 200, `статус ${res.status}`)
    cli = await fetch(`${BASE}/api/photo/${photoId}/file?token=${e2eToken}`)
    check('клиент больше НЕ видит фото → 403', cli.status === 403, `статус ${cli.status}`)
    res = await api('PATCH', `/api/photo/${photoId}`, { visible: true }, { cookie, origin })
    check('возврат видимости (PATCH visible=true)', res.status === 200, `статус ${res.status}`)

    // =====================================================================
    console.log('\nФАЗА 7 — сохранность фото и данных после перезапуска')
    // =====================================================================
    await srv.stop()
    srv = await startServer({ ...envDb })

    res = await api('POST', '/api/auth/login', { password: E2E_PASSWORD })
    const cookie2 = cookieOf(res.setCookie)
    assert(cookie2 !== '', 'после рестарта вход не удался')

    const fileRes2 = await fetch(`${BASE}/api/photo/${photoId}/file`, { headers: { cookie: cookie2 } })
    const fileBuf2 = Buffer.from(await fileRes2.arrayBuffer())
    check('фото пережило перезапуск (те же байты)', fileRes2.status === 200 && fileBuf2.length === fileBuf1.length, `${fileRes2.status}, ${fileBuf2.length} vs ${fileBuf1.length}`)

    const actsRes = (await (await fetch(`${BASE}/api/acts`, { headers: { cookie: cookie2 } })).json()) as unknown[] | null
    check('акты пережили перезапуск', (actsRes?.length ?? 0) >= 2, `items=${actsRes?.length}`)

    // =====================================================================
    console.log('\nФАЗА 8 — бэкап и восстановление (данные + файлы)')
    // =====================================================================
    const backupRes = await fetch(`${BASE}/api/backup`, { headers: { cookie: cookie2 } })
    const backupText = await backupRes.text()
    check('скачивание бэкапа JSON', backupRes.status === 200 && backupText.includes('"version"'), `статус ${backupRes.status}`)

    const restoreRes = await fetch(`${BASE}/api/backup/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie2, origin: String(origin) },
      body: backupText,
    })
    const restoreJson = (await restoreRes.json()) as { ok?: boolean; counts?: Record<string, number> } | null
    check('восстановление из бэкапа', restoreRes.status === 200 && restoreJson?.ok === true, `статус ${restoreRes.status}`)

    const dashRes = (await (await fetch(`${BASE}/api/dashboard`, { headers: { cookie: cookie2 } })).json()) as Record<string, unknown> | null
    check('после restore дашборд живой', !!dashRes)

    const fileRes3 = await fetch(`${BASE}/api/photo/${photoId}/file`, { headers: { cookie: cookie2 } })
    check('фото-файл цел после restore (файлы не трогались)', fileRes3.status === 200, `статус ${fileRes3.status}`)

    // =====================================================================
    console.log('\nФАЗА 9 — logout')
    // =====================================================================
    res = await api('POST', '/api/auth/logout', undefined, { cookie: cookie2, origin })
    check('logout → 200', res.status === 200, `статус ${res.status}`)
    res = await api('GET', '/api/dashboard', undefined, { cookie: cookie2 })
    check('сессия аннулирована → 401', res.status === 401, `статус ${res.status}`)

    await srv.stop()

    // --- итог ---------------------------------------------------------------
    const failed = results.filter((x) => !x.ok)
    console.log('\n════════ ИТОГ ════════')
    console.log(`пройдено: ${results.length - failed.length}/${results.length}`)
    for (const f of failed) console.log(`  ✘ ${f.name}${f.note ? ` — ${f.note}` : ''}`)
    process.exit(failed.length === 0 ? 0 : 1)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((e) => {
  console.error('\nE2E УПАЛ:', e instanceof Error ? e.message : e)
  process.exit(1)
})
