// Тест бэкапа/восстановления на СИНТЕТИЧЕСКОЙ базе.
// Запуск (Node.js, без Bun):
//   DATABASE_URL="file:/tmp/synth.db" npx prisma db push --skip-generate
//   DATABASE_URL="file:/tmp/synth.db" npm run test:restore
//
// Скрипт самодостаточен: чистит таблицы, создаёт синтетику, делает бэкап,
// ломает данные, восстанавливает и сверяет. БЕЗОПАСНОСТЬ: тест работает ТОЛЬКО
// с базой во временной папке ОС (os.tmpdir) — любые другие пути (включая
// рабочую db/custom.db, независимо от того, как она указана) — отказ.

import { PrismaClient } from '@prisma/client'
import { tmpdir } from 'os'
import path from 'path'

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('file:')) {
    console.error('ОТКАЗ: задайте DATABASE_URL вида file:/tmp/synth.db (тестовая база).')
    process.exit(1)
  }
  // защита: тестовая база — ТОЛЬКО во временной папке ОС.
  // Относительные пути Prisma резолвит от prisma/, а не от cwd — проверяем
  // ОБА варианта резолва: все кандидаты должны быть в os.tmpdir().
  const raw = url.replace(/^file:/, '')
  const tmp = tmpdir()
  const candidates = path.isAbsolute(raw)
    ? [raw]
    : [
        path.resolve(process.cwd(), 'prisma', raw),
        path.resolve(process.cwd(), raw),
      ]
  const bad = candidates.filter((c) => !path.resolve(c).startsWith(path.resolve(tmp) + path.sep))
  if (bad.length > 0) {
    console.error(`ОТКАЗ: тестовая база должна лежать во временной папке (${tmp}).`)
    console.error(`Указано: ${url} (резолвится в ${candidates.join(' ; ')})`)
    console.error('Рабочие базы тестом не затрагиваются — создайте отдельную:')
    console.error(`  DATABASE_URL="file:${path.join(tmp, 'synth.db')}" npx prisma db push --skip-generate`)
    process.exit(1)
  }

  const db = new PrismaClient()
  try {
    // --- подготовка: чистим таблицы (файл и схему создаёт `prisma db push`) --
    try {
      await db.comment.deleteMany()
      await db.template.deleteMany()
      await db.photo.deleteMany()
      await db.payment.deleteMany()
      await db.actLine.deleteMany()
      await db.act.deleteMany()
      await db.estimateLine.deleteMany()
      await db.estimate.deleteMany()
      await db.stage.deleteMany()
      await db.buildObject.deleteMany()
      await db.priceItem.deleteMany()
      await db.session.deleteMany()
      await db.appSettings.deleteMany()
    } catch {
      console.error('ОТКАЗ: в базе нет таблиц. Сначала создайте схему:')
      console.error(`  DATABASE_URL="${url}" npx prisma db push --skip-generate`)
      process.exit(1)
    }
    // --- фаза 1: синтетические данные ------------------------------------
    await db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, masterName: 'СИНТЕТИКА' } })
    const obj = await db.buildObject.create({
      data: { name: 'СИНТЕТИКА-объект', customer: 'тест', clientToken: 'synth-1' },
    })
    await db.estimate.create({
      data: {
        objectId: obj.id,
        title: 'СИНТЕТИКА-смета',
        shareToken: 'synth-est-1',
        lines: { create: [{ pos: 1, name: 'синт-работа', qty: 10, unit: 'м²', price: 100, section: 'стены' }] },
      },
    })
    await db.act.create({
      data: {
        objectId: obj.id,
        actNo: 1,
        token: 'synth-act-1',
        lines: { create: [{ pos: 1, name: 'синт-работа', qty: 5, unit: 'м²', price: 100, section: 'стены' }] },
      },
    })
    await db.priceItem.create({
      data: { name: 'синт-цена', unit: 'м²', price: 50, section: 'стены', source: 'синтетика', active: true },
    })
    console.log('фаза 1 — синтетика создана:', {
      objects: await db.buildObject.count(),
      estimates: await db.estimate.count(),
      acts: await db.act.count(),
    })

    // --- фаза 2: бэкап -----------------------------------------------------
    const { makeBackup, restoreBackup } = await import('../src/db/queries')
    const backup = await makeBackup()
    if (!backup || !Array.isArray(backup.objects) || backup.objects.length !== 1) {
      console.error('FAIL: бэкап не содержит ожидаемых данных', backup)
      process.exit(1)
    }
    console.log('фаза 2 — бэкап снят:', {
      objects: backup.objects.length,
      estimates: (backup as { estimates?: unknown[] }).estimates?.length ?? '?',
      acts: (backup as { acts?: unknown[] }).acts?.length ?? '?',
    })

    // --- фаза 3: ломаем базу ----------------------------------------------
    await db.buildObject.create({ data: { name: 'МУСОР-объект', customer: 'x', clientToken: 'garbage-' + Date.now() } })
    await db.act.deleteMany({})
    console.log('фаза 3 — база испорчена:', {
      objects: await db.buildObject.count(),
      acts: await db.act.count(),
    })

    // --- фаза 4: восстановление -------------------------------------------
    const result = await restoreBackup(backup)
    if (!result.ok) {
      console.error('FAIL: восстановление не удалось:', result.error)
      process.exit(1)
    }
    const after = {
      objects: await db.buildObject.count(),
      estimates: await db.estimate.count(),
      acts: await db.act.count(),
      prices: await db.priceItem.count(),
      master: (await db.appSettings.findUnique({ where: { id: 1 } }))?.masterName,
    }
    const names = (await db.buildObject.findMany()).map((o) => o.name)
    console.log('фаза 4 — после restore:', after, 'counts=', result.counts)

    const ok =
      after.objects === 1 &&
      after.estimates === 1 &&
      after.acts === 1 &&
      after.prices === 1 &&
      after.master === 'СИНТЕТИКА' &&
      names.includes('СИНТЕТИКА-объект') &&
      !names.some((n) => n.startsWith('МУСОР'))
    console.log(ok ? 'RESTORE TEST PASSED' : 'RESTORE TEST FAILED')
    if (!ok) process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
