// Демо-сид «ПрорАКТ 360» v2.
// ДАННЫЕ ВЫМЫШЛЕННЫЕ: имена, адреса, объёмы и цены синтетические (source: 'demo').
// Структура повторяет реальный рабочий процесс мастера: смета с разделами
// (стены/потолки/доп) → еженедельные акты = подмножество строк сметы → оплаты;
// фото — реальные JPEG-файлы, сгенерированные sharp (db/uploads/).
//
// БЕЗОПАСНОСТЬ ДАННЫХ:
//   • по умолчанию сидится ТОЛЬКО пустая база; непустая — отказ (exit 1),
//     ничего не удаляется;
//   • флаг --force (или SEED_FORCE=1) разрешает сброс, но перед удалением
//     автоматически создаётся бэкап: db/backup-before-seed-<время>.db
//     и копия db/uploads/ — молчаливой потери данных нет.

import { db } from '@/lib/db'
import { rm, cp, access } from 'fs/promises'
import { constants } from 'fs'
import path from 'path'
import { makeSyntheticPhoto, saveBuffers } from './uploads'
import { createActFromEstimateLines } from './queries'
import { sqliteDbFile, uploadsDirPath } from './paths'

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}
function daysAhead(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Путь к файлу SQLite (по правилам резолва Prisma — см. src/db/paths.ts). */
function sqliteFilePath(): string {
  return sqliteDbFile()
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function wipe() {
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
}

/** Проверка «база пуста?» без удаления чего-либо. */
async function databaseIsEmpty(): Promise<boolean> {
  const counts = await Promise.all([
    db.buildObject.count(),
    db.estimate.count(),
    db.act.count(),
    db.priceItem.count(),
    db.template.count(),
    db.photo.count(),
    db.payment.count(),
    db.appSettings.count(),
  ])
  return counts.every((c) => c === 0)
}

/** Бэкап базы и фото перед разрушающим сбросом. */
async function backupBeforeReset(): Promise<{ dbBackup: string; uploadsBackup: string | null }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dbFile = sqliteFilePath()
  const dbBackup = `${dbFile}.backup-before-seed-${stamp}`
  let uploadsBackup: string | null = null
  if (await fileExists(dbFile)) {
    await cp(dbFile, dbBackup)
  }
  const uploadsDir = uploadsDirPath()
  if (await fileExists(uploadsDir)) {
    uploadsBackup = path.join(path.dirname(uploadsDir), `uploads-backup-${stamp}`)
    await cp(uploadsDir, uploadsBackup, { recursive: true })
  }
  return { dbBackup, uploadsBackup }
}

type SeedLine = {
  name: string
  qty: number
  unit: string
  price: number
  hidden?: boolean
  section: string
  note?: string
}

async function main() {
  const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1'

  // --- защита от затирания чужих данных -----------------------------------
  const isEmpty = await databaseIsEmpty()
  if (!isEmpty && !force) {
    const counts = await Promise.all([
      db.buildObject.count(),
      db.estimate.count(),
      db.act.count(),
      db.priceItem.count(),
    ])
    console.error('ОТКАЗ: база не пуста (объекты/сметы/акты/цены:', counts.join('/'), ').')
    console.error('Сид по умолчанию работает только с пустой базой — данные НЕ тронуты.')
    console.error('Для сброса демо-данных с автоматическим бэкапом запустите:')
    console.error('  npm run db:seed:reset   (или: bun|tsx src/db/seed.ts --force)')
    process.exit(1)
  }
  if (!isEmpty && force) {
    const { dbBackup, uploadsBackup } = await backupBeforeReset()
    console.log('Бэкап перед сбросом:')
    console.log('  база:  ', dbBackup)
    if (uploadsBackup) console.log('  фото:  ', uploadsBackup)
  }

  console.log('Стираю демо-данные…')
  await wipe()

  // чистим хранилище фото от старых демо-файлов (рядом с ЭТОЙ базой)
  try {
    await rm(uploadsDirPath(), { recursive: true, force: true })
  } catch {
    /* не критично */
  }

  // --- настройки -------------------------------------------------------------
  await db.appSettings.create({
    data: { id: 1, lang: 'ru', masterName: 'Мастер (демо)', companyName: 'ПрорАКТ 360 (демо)' },
  })

  // --- объекты ----------------------------------------------------------------
  const o1 = await db.buildObject.create({
    data: {
      name: 'ЖК «Сонячна Рівія», кв. 42',
      customer: 'Олена (демо)',
      address: 'Київ, демо-адреса 42',
      status: 'active',
      deadline: daysAhead(30),
      clientToken: 'demo-rivija-42',
      locale: 'uk',
    },
  })
  const o2 = await db.buildObject.create({
    data: {
      name: 'Таунхаус «Затишний», 7',
      customer: 'Игорь (демо)',
      address: 'Демо-посёлок, ул. Строителей 7',
      status: 'active',
      deadline: daysAhead(60),
      clientToken: 'demo-zatishniy-7',
      locale: 'ru',
    },
  })
  const o3 = await db.buildObject.create({
    data: {
      name: 'Кофейня «Бариста», Подол',
      customer: 'Мария (демо)',
      address: 'Демо-город, ул. Старая 3',
      status: 'done',
      deadline: daysAgo(10),
      clientToken: 'demo-barista-3',
      locale: 'ru',
    },
  })

  // --- этапы -------------------------------------------------------------------
  const stageTitles1 = [
    'Подготовка основания',
    'Шпаклёвка и стеклохолст',
    'Финишная покраска',
    'Уборка и сдача',
  ]
  const stages1: { id: number }[] = []
  for (let i = 0; i < stageTitles1.length; i++) {
    const st = await db.stage.create({
      data: {
        objectId: o1.id,
        order: i + 1,
        title: stageTitles1[i],
        status: i === 0 ? 'done' : i === 1 ? 'current' : i === 2 ? 'next' : 'todo',
        doneAt: i === 0 ? daysAgo(28) : null,
      },
    })
    stages1.push(st)
  }
  const stageTitles2 = ['Черновые работы', 'Малярные работы', 'Плитка и сдача']
  const stages2: { id: number }[] = []
  for (let i = 0; i < stageTitles2.length; i++) {
    const st = await db.stage.create({
      data: {
        objectId: o2.id,
        order: i + 1,
        title: stageTitles2[i],
        status: i === 0 ? 'done' : i === 1 ? 'current' : 'todo',
        doneAt: i === 0 ? daysAgo(15) : null,
      },
    })
    stages2.push(st)
  }
  const stages3: { id: number }[] = []
  for (let i = 0; i < 2; i++) {
    const st = await db.stage.create({
      data: {
        objectId: o3.id,
        order: i + 1,
        title: i === 0 ? 'Ремонт и покраска' : 'Сдача объекта',
        status: 'done',
        doneAt: daysAgo(20 - i * 5),
      },
    })
    stages3.push(st)
  }

  // --- прайс-каталог (синтетические цены, source: demo) -------------------------
  const priceItems: Array<[string, string, number, string]> = [
    ['укрывка окон гофрокартоном', 'м²', 30, 'подготовка'],
    ['укрывка плёнкой для защиты поверхности', 'м²', 30, 'подготовка'],
    ['заделка штроб', 'м.п', 65, 'подготовка'],
    ['заделка стыков гипсокартона с сеткой и лентой стен', 'м²', 60, 'подготовка'],
    ['шлифовка стен штукатурки перед шпаклёвкой', 'м²', 50, 'подготовка'],
    ['грунтовка стен перед шпаклёвкой', 'м²', 25, 'подготовка'],
    ['грунтовка откосов и участков стен до 60см перед шпаклёвкой', 'м.п', 25, 'подготовка'],
    ['шпаклёвка стен под стеклохолст', 'м²', 125, 'стены'],
    ['шпаклёвка под стеклохолст откосов и участков стен до 60см', 'м.п', 125, 'стены'],
    ['шлифовка шпаклёвки стен под стеклохолст', 'м²', 45, 'стены'],
    ['грунтовка стен перед поклейкой стеклохолста', 'м²', 25, 'стены'],
    ['поклейка стеклохолста на стены', 'м²', 115, 'стены'],
    ['поклейка стеклохолста на откосы и участки стен до 60см', 'м.п', 115, 'стены'],
    ['шпаклёвка стен под покраску по стеклохолсту', 'м²', 185, 'стены'],
    ['шлифовка шпаклёвки стен под покраску', 'м²', 55, 'стены'],
    ['грунтовка стен под покраску', 'м²', 25, 'стены'],
    ['нанесение грунт краски на стены', 'м²', 70, 'стены'],
    ['покраска стен валиком', 'м²', 125, 'стены'],
    ['покраска стен безвоздушным методом нанесения', 'м²', 145, 'стены'],
    ['нанесение акрила на углы примыкания', 'м.п', 110, 'стены'],
    ['заделка стыков гипсокартона потолков', 'м²', 100, 'потолки'],
    ['шпаклёвка потолков под стеклохолст', 'м²', 155, 'потолки'],
    ['поклейка стеклохолста на потолок', 'м²', 145, 'потолки'],
    ['шпаклёвка потолка под покраску по стеклохолсту', 'м²', 245, 'потолки'],
    ['шлифовка шпаклёвки потолка под покраску', 'м²', 75, 'потолки'],
    ['покраска потолка безвоздушным методом', 'м²', 165, 'потолки'],
    ['установка перфорированного пластикового уголка', 'м.п', 85, 'доп'],
    ['монтаж откосов из гипсокартона', 'м.п', 230, 'доп'],
    ['занос материала', 'шт', 30, 'доп'],
    ['оттяжка перепада плоскости', 'м.п', 60, 'доп'],
  ]
  for (const [name, unit, price, section] of priceItems) {
    await db.priceItem.create({
      data: {
        name,
        unit,
        price,
        category: section,
        section,
        source: 'demo',
        sourceDate: 'демо',
        note: 'синтетическая демо-цена, не реальная',
        active: true,
      },
    })
  }

  // --- смета объекта 1 (разделы как в реальном процессе) ------------------------
  const est1Lines: SeedLine[] = [
    { name: 'укрывка окон гофрокартоном', qty: 14, unit: 'м²', price: 30, hidden: true, section: 'подготовка' },
    { name: 'заделка штроб', qty: 42, unit: 'м.п', price: 65, hidden: true, section: 'подготовка' },
    { name: 'шлифовка стен штукатурки перед шпаклёвкой', qty: 96, unit: 'м²', price: 50, hidden: true, section: 'подготовка' },
    { name: 'грунтовка стен перед шпаклёвкой', qty: 96, unit: 'м²', price: 25, hidden: true, section: 'подготовка' },
    { name: 'занос материала', qty: 6, unit: 'шт', price: 30, section: 'доп', note: 'доставка мешков' },
    { name: 'шпаклёвка стен под стеклохолст', qty: 96, unit: 'м²', price: 125, hidden: true, section: 'стены' },
    { name: 'шлифовка шпаклёвки стен под стеклохолст', qty: 96, unit: 'м²', price: 45, hidden: true, section: 'стены' },
    { name: 'поклейка стеклохолста на стены', qty: 96, unit: 'м²', price: 115, section: 'стены' },
    { name: 'шпаклёвка стен под покраску по стеклохолсту', qty: 96, unit: 'м²', price: 185, section: 'стены' },
    { name: 'шлифовка шпаклёвки стен под покраску', qty: 96, unit: 'м²', price: 55, section: 'стены' },
    { name: 'грунтовка стен под покраску', qty: 96, unit: 'м²', price: 25, section: 'стены' },
    { name: 'нанесение грунт краски на стены', qty: 96, unit: 'м²', price: 70, section: 'стены' },
    { name: 'покраска стен безвоздушным методом нанесения', qty: 96, unit: 'м²', price: 145, section: 'стены' },
    { name: 'заделка стыков гипсокартона потолков', qty: 38, unit: 'м²', price: 100, hidden: true, section: 'потолки' },
    { name: 'шпаклёвка потолков под стеклохолст', qty: 38, unit: 'м²', price: 155, hidden: true, section: 'потолки' },
    { name: 'поклейка стеклохолста на потолок', qty: 38, unit: 'м²', price: 145, section: 'потолки' },
    { name: 'шпаклёвка потолка под покраску по стеклохолсту', qty: 38, unit: 'м²', price: 245, section: 'потолки' },
    { name: 'покраска потолка безвоздушным методом', qty: 38, unit: 'м²', price: 165, section: 'потолки' },
    { name: 'установка перфорированного пластикового уголка', qty: 24, unit: 'м.п', price: 85, section: 'доп' },
    { name: 'нанесение акрила на углы примыкания', qty: 24, unit: 'м.п', price: 110, section: 'доп' },
  ]
  const est1 = await db.estimate.create({
    data: {
      objectId: o1.id,
      title: 'Малярные работы — кв. 42',
      status: 'approved',
      coeff: 1,
      shareToken: 'demo-est-rivija',
      sentAt: daysAgo(35),
      approvedAt: daysAgo(33),
      note: 'коэффициент сложности не применялся (высота 2.7)',
    },
  })
  for (let i = 0; i < est1Lines.length; i++) {
    await db.estimateLine.create({ data: { estimateId: est1.id, pos: i + 1, ...est1Lines[i] } })
  }
  const est1LinesDb = await db.estimateLine.findMany({ where: { estimateId: est1.id }, orderBy: { pos: 'asc' } })
  const line1 = (n: string) => est1LinesDb.find((l) => l.name.startsWith(n))!

  // --- еженедельные акты объекта 1 (как в реальном процессе: подмножество строк) --
  // Акт 1 (неделя 1): подготовка
  await createActFromEstimateLines({
    objectId: o1.id,
    estimateId: est1.id,
    entries: [
      { lineId: line1('укрывка окон').id, qty: 14 },
      { lineId: line1('заделка штроб').id, qty: 42 },
      { lineId: line1('занос материала').id, qty: 4 },
    ],
    periodFrom: daysAgo(31).toISOString(),
    periodTo: daysAgo(25).toISOString(),
  })
  // Акт 2 (неделя 2): шлифовка+грунтовка ЧАСТИЧНО (96 → 55)
  await createActFromEstimateLines({
    objectId: o1.id,
    estimateId: est1.id,
    entries: [
      { lineId: line1('шлифовка стен штукатурки').id, qty: 55 },
      { lineId: line1('грунтовка стен перед шпаклёвкой').id, qty: 55 },
      { lineId: line1('занос материала').id, qty: 2 },
    ],
    periodFrom: daysAgo(24).toISOString(),
    periodTo: daysAgo(18).toISOString(),
  })
  // Акт 3 (неделя 3): остаток шлифовки/грунтовки + шпаклёвка частично
  await createActFromEstimateLines({
    objectId: o1.id,
    estimateId: est1.id,
    entries: [
      { lineId: line1('шлифовка стен штукатурки').id, qty: 41 },
      { lineId: line1('грунтовка стен перед шпаклёвкой').id, qty: 41 },
      { lineId: line1('шпаклёвка стен под стеклохолст').id, qty: 60 },
    ],
    periodFrom: daysAgo(17).toISOString(),
    periodTo: daysAgo(11).toISOString(),
  })
  // Акт 4 (неделя 4): шпаклёвка остаток + шлифовка частично
  await createActFromEstimateLines({
    objectId: o1.id,
    estimateId: est1.id,
    entries: [
      { lineId: line1('шпаклёвка стен под стеклохолст').id, qty: 36 },
      { lineId: line1('шлифовка шпаклёвки стен под стеклохолст').id, qty: 60 },
    ],
    periodFrom: daysAgo(10).toISOString(),
    periodTo: daysAgo(4).toISOString(),
  })

  const acts1 = await db.act.findMany({ where: { objectId: o1.id }, orderBy: { actNo: 'asc' } })
  // оплаты: акт 1 оплачен полностью, акт 2 частично, акт 3 не оплачен, акт 4 не оплачен
  await db.payment.create({ data: { actId: acts1[0].id, amount: round2(14 * 30 + 42 * 65 + 4 * 30), at: daysAgo(24), note: 'предоплата недели 1' } })
  const act2Total = 55 * 50 + 55 * 25 + 2 * 30
  await db.payment.create({ data: { actId: acts1[1].id, amount: round2(act2Total * 0.5), at: daysAgo(16), note: 'частичная оплата' } })

  // --- смета объекта 2 ------------------------------------------------------------
  const est2 = await db.estimate.create({
    data: {
      objectId: o2.id,
      title: 'Черновые + малярные работы',
      status: 'sent',
      coeff: 1.15,
      shareToken: 'demo-est-zatishniy',
      sentAt: daysAgo(8),
      note: 'коэффициент 1.15 за высоту 2.9 м',
    },
  })
  const est2Lines: SeedLine[] = [
    { name: 'шлифовка стен штукатурки перед шпаклёвкой', qty: 160, unit: 'м²', price: 50, hidden: true, section: 'подготовка' },
    { name: 'грунтовка стен перед шпаклёвкой', qty: 160, unit: 'м²', price: 25, hidden: true, section: 'подготовка' },
    { name: 'шпаклёвка стен под стеклохолст', qty: 160, unit: 'м²', price: 125, hidden: true, section: 'стены' },
    { name: 'поклейка стеклохолста на стены', qty: 160, unit: 'м²', price: 115, section: 'стены' },
    { name: 'шпаклёвка стен под покраску по стеклохолсту', qty: 160, unit: 'м²', price: 185, section: 'стены' },
    { name: 'покраска стен безвоздушным методом нанесения', qty: 160, unit: 'м²', price: 145, section: 'стены' },
    { name: 'шпаклёвка потолка под покраску по стеклохолсту', qty: 55, unit: 'м²', price: 245, section: 'потолки' },
    { name: 'покраска потолка безвоздушным методом', qty: 55, unit: 'м²', price: 165, section: 'потолки' },
    { name: 'монтаж откосов из гипсокартона', qty: 18, unit: 'м.п', price: 230, section: 'доп' },
  ]
  for (let i = 0; i < est2Lines.length; i++) {
    await db.estimateLine.create({ data: { estimateId: est2.id, pos: i + 1, ...est2Lines[i] } })
  }
  // акт по объекту 2: маленький первый акт (укрытие выполнено вне сметы)
  const act5 = await db.act.create({
    data: {
      objectId: o2.id,
      actNo: 1,
      date: daysAgo(12),
      periodFrom: daysAgo(14).toISOString(),
      periodTo: daysAgo(12).toISOString(),
      token: 'demo-act-zat-1',
      lines: {
        create: [{ pos: 1, name: 'демонтаж старого покрытия', qty: 48, unit: 'м²', price: 75, section: 'подготовка' }],
      },
    },
  })
  await db.payment.create({ data: { actId: act5.id, amount: 3600, at: daysAgo(11), note: 'оплата сразу' } })

  // --- акты объекта 3 (закрытый) ---------------------------------------------------
  const act6 = await db.act.create({
    data: {
      objectId: o3.id,
      actNo: 1,
      date: daysAgo(30),
      periodFrom: daysAgo(36).toISOString(),
      periodTo: daysAgo(30).toISOString(),
      token: 'demo-act-bar-1',
      lines: {
        create: [
          { pos: 1, name: 'подготовка стен под покраску', qty: 84, unit: 'м²', price: 55, section: 'подготовка' },
          { pos: 2, name: 'покраска стен валиком', qty: 84, unit: 'м²', price: 125, section: 'стены' },
        ],
      },
    },
  })
  const act7 = await db.act.create({
    data: {
      objectId: o3.id,
      actNo: 2,
      date: daysAgo(18),
      periodFrom: daysAgo(24).toISOString(),
      periodTo: daysAgo(18).toISOString(),
      token: 'demo-act-bar-2',
      lines: {
        create: [
          { pos: 1, name: 'покраска потолка безвоздушным методом', qty: 30, unit: 'м²', price: 165, section: 'потолки' },
          { pos: 2, name: 'нанесение акрила на углы примыкания', qty: 16, unit: 'м.п', price: 110, section: 'доп' },
        ],
      },
    },
  })
  const a6total = 84 * 55 + 84 * 125
  const a7total = 30 * 165 + 16 * 110
  await db.payment.create({ data: { actId: act6.id, amount: a6total, at: daysAgo(28) } })
  await db.payment.create({ data: { actId: act7.id, amount: a7total, at: daysAgo(15) } })

  // --- шаблоны ---------------------------------------------------------------------
  const templates: Array<[string, SeedLine[]]> = [
    [
      'Стена под покраску (техцикл)',
      [
        { name: 'шлифовка стен штукатурки перед шпаклёвкой', qty: 1, unit: 'м²', price: 50, hidden: true, section: 'подготовка' },
        { name: 'грунтовка стен перед шпаклёвкой', qty: 1, unit: 'м²', price: 25, hidden: true, section: 'подготовка' },
        { name: 'шпаклёвка стен под стеклохолст', qty: 1, unit: 'м²', price: 125, hidden: true, section: 'стены' },
        { name: 'поклейка стеклохолста на стены', qty: 1, unit: 'м²', price: 115, section: 'стены' },
        { name: 'шпаклёвка стен под покраску по стеклохолсту', qty: 1, unit: 'м²', price: 185, section: 'стены' },
        { name: 'покраска стен безвоздушным методом нанесения', qty: 1, unit: 'м²', price: 145, section: 'стены' },
      ],
    ],
    [
      'Потолок под покраску (техцикл)',
      [
        { name: 'заделка стыков гипсокартона потолков', qty: 1, unit: 'м²', price: 100, hidden: true, section: 'потолки' },
        { name: 'шпаклёвка потолков под стеклохолст', qty: 1, unit: 'м²', price: 155, hidden: true, section: 'потолки' },
        { name: 'поклейка стеклохолста на потолок', qty: 1, unit: 'м²', price: 145, section: 'потолки' },
        { name: 'шпаклёвка потолка под покраску по стеклохолсту', qty: 1, unit: 'м²', price: 245, section: 'потолки' },
        { name: 'покраска потолка безвоздушным методом', qty: 1, unit: 'м²', price: 165, section: 'потолки' },
      ],
    ],
    [
      'Откосы дверные',
      [
        { name: 'монтаж откосов из гипсокартона', qty: 1, unit: 'м.п', price: 230, section: 'доп' },
        { name: 'установка перфорированного пластикового уголка', qty: 1, unit: 'м.п', price: 85, section: 'доп' },
        { name: 'нанесение акрила на углы примыкания', qty: 1, unit: 'м.п', price: 110, section: 'доп' },
      ],
    ],
    [
      'Укрытие перед работами',
      [
        { name: 'укрывка окон гофрокартоном', qty: 1, unit: 'м²', price: 30, hidden: true, section: 'подготовка' },
        { name: 'укрывка плёнкой для защиты поверхности', qty: 1, unit: 'м²', price: 30, hidden: true, section: 'подготовка' },
      ],
    ],
  ]
  for (const [name, lines] of templates) {
    await db.template.create({
      data: { name, lines: JSON.stringify(lines.map(({ name: n, qty, unit, price, hidden, section }) => ({ name: n, qty, unit, price, hidden: hidden ?? false, section }))) },
    })
  }

  // --- комментарии ------------------------------------------------------------------
  await db.comment.create({
    data: { estimateId: est1.id, author: 'client', text: 'Добрий день! Коли можна побачити фото стін після шпаклівки?', createdAt: daysAgo(9) },
  })
  await db.comment.create({
    data: { estimateId: est1.id, author: 'master', text: 'Доброго! Додаю фотоотчёт в акт №4 — всё уже в кабинете.', createdAt: daysAgo(9) },
  })

  // --- фото (синтетические JPEG через sharp) -----------------------------------------
  const photoSpecs: Array<{
    obj: number
    stage?: number
    act?: number
    line?: string
    kind: string
    caption: string
    visible: boolean
    seed: number
    taken: number
  }> = [
    { obj: o1.id, stage: stages1[0].id, act: acts1[0].id, kind: 'progress', caption: 'Укрытие окон перед началом', visible: true, seed: 1, taken: 31 },
    { obj: o1.id, stage: stages1[0].id, act: acts1[0].id, kind: 'hidden', caption: 'Заделка штроб — скрытая работа', visible: true, seed: 2, taken: 30 },
    { obj: o1.id, stage: stages1[0].id, kind: 'progress', caption: 'Шлифовка стен, неделя 2', visible: true, seed: 3, taken: 22 },
    { obj: o1.id, stage: stages1[1].id, act: acts1[2].id, kind: 'hidden', caption: 'Первый слой шпаклёвки (скрытая подготовка)', visible: true, seed: 4, taken: 14 },
    { obj: o1.id, stage: stages1[1].id, act: acts1[3].id, kind: 'progress', caption: 'Шлифовка под стеклохолст', visible: true, seed: 5, taken: 6 },
    { obj: o1.id, stage: stages1[1].id, kind: 'defect', caption: 'Раковина на стене — переделать', visible: false, seed: 6, taken: 5 },
    { obj: o1.id, stage: stages1[1].id, kind: 'material', caption: 'Занос шпаклёвки, 6 мешков', visible: true, seed: 7, taken: 31 },
    { obj: o2.id, stage: stages2[0].id, act: act5.id, kind: 'progress', caption: 'Демонтаж старого покрытия', visible: true, seed: 8, taken: 13 },
    { obj: o2.id, stage: stages2[1].id, kind: 'progress', caption: 'Стены после грунтовки', visible: true, seed: 9, taken: 7 },
    { obj: o3.id, stage: stages3[0].id, act: act6.id, kind: 'progress', caption: 'Покраска зала кофейни', visible: true, seed: 10, taken: 29 },
  ]

  let photoIdx = 0
  for (const spec of photoSpecs) {
    photoIdx++
    const { buffer, thumb } = await makeSyntheticPhoto(spec.seed, spec.caption)
    const fullName = `demo-photo-${String(photoIdx).padStart(2, '0')}.jpg`
    await saveBuffers(fullName, buffer, thumb)
    // привязка к строке сметы для скрытых работ
    let estimateLineId: number | null = null
    if (spec.kind === 'hidden' && spec.obj === o1.id) {
      const target = est1LinesDb.find((l) => spec.caption.toLowerCase().includes(l.name.split(' ')[0].toLowerCase()))
      estimateLineId = target?.id ?? null
    }
    await db.photo.create({
      data: {
        objectId: spec.obj,
        stageId: spec.stage ?? null,
        actId: spec.act ?? null,
        estimateLineId,
        kind: spec.kind,
        storage: 'file',
        path: fullName,
        thumbPath: fullName.replace(/\.jpg$/, '-t.jpg'),
        mime: 'image/jpeg',
        size: buffer.length,
        width: 1280,
        height: 960,
        caption: spec.caption,
        visible: spec.visible,
        takenAt: daysAgo(spec.taken),
      },
    })
  }

  const counts = {
    objects: 3,
    estimates: 2,
    lines: est1Lines.length + est2Lines.length,
    acts: 4 + 3,
    photos: photoIdx,
    priceItems: priceItems.length,
    templates: templates.length,
  }
  console.log('Демо-данные созданы:', JSON.stringify(counts, null, 2))
  console.log('Токены кабинетов: demo-rivija-42, demo-zatishniy-7, demo-barista-3')
  console.log('Share-токены смет: demo-est-rivija, demo-est-zatishniy')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
