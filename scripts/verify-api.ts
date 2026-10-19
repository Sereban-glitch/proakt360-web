// Ручная проверка бэкенда «ПрорАКТ 360» (НЕ тест-фреймворк):
// запускаем запросы напрямую к хелперам и сверяем ключевые числа сида.
//   bun scripts/verify-api.ts

import { db } from '../src/lib/db'
import {
  getDashboard,
  listObjectBriefs,
  getObjectDetail,
  getEstimateDetail,
  getActDetail,
  listActBriefs,
  listEstimateBriefs,
  getClientCabinet,
} from '../src/db/queries'
import { parseLineText } from '../src/db/parse'
import { buildRoomLines, roomPresets, roomPresetByKey } from '../src/db/rooms'

let failures = 0

function check(label: string, ok: boolean, actual?: unknown, expected?: unknown): void {
  if (ok) {
    console.log(`  ✅ ${label}${actual !== undefined ? ` → ${JSON.stringify(actual)}` : ''}`)
  } else {
    failures++
    console.log(`  ❌ ${label}: получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`)
  }
}

function approx(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) < eps
}

async function main(): Promise<void> {
  console.log('\n== Дашборд ==')
  const dash = await getDashboard()
  check('stats.objects = 3', dash.stats.objects === 3, dash.stats.objects, 3)
  check('stats.acts = 9', dash.stats.acts === 9, dash.stats.acts, 9)
  check('stats.total = 147550', approx(dash.stats.total, 147550), dash.stats.total, 147550)
  check('stats.paid = 127225', approx(dash.stats.paid, 127225), dash.stats.paid, 127225)
  check('stats.photos = 10', dash.stats.photos === 10, dash.stats.photos, 10)
  check('stats.zeroActs = 0', dash.stats.zeroActs === 0, dash.stats.zeroActs, 0)
  check('stats.unpaidActs = 4', dash.stats.unpaidActs === 4, dash.stats.unpaidActs, 4)
  check('debtTotal = 20325', approx(dash.debtTotal, 20325), dash.debtTotal, 20325)
  check('priceCount = 18', dash.priceCount === 18, dash.priceCount, 18)
  check('debts.length = 4', dash.debts.length === 4, dash.debts.length, 4)
  check('recentActs.length = 5', dash.recentActs.length === 5, dash.recentActs.length, 5)
  check('activeEstimates = 2', dash.activeEstimates.length === 2, dash.activeEstimates.length, 2)

  console.log('\n== Объекты ==')
  const objects = await listObjectBriefs()
  check('объектов = 3', objects.length === 3, objects.length, 3)
  const obj1 = objects.find((o) => o.clientToken === 'demo-tihaya-gavan')
  check('объект 1 найден', !!obj1)
  if (obj1) {
    check('obj1.acts = 5', obj1.acts === 5, obj1.acts, 5)
    check('obj1.total = 58950', approx(obj1.total, 58950), obj1.total, 58950)
    check('obj1.paid = 38625', approx(obj1.paid, 38625), obj1.paid, 38625)
    check('obj1.debt = 20325', approx(obj1.debt, 20325), obj1.debt, 20325)
    check('obj1.photos = 6', obj1.photos === 6, obj1.photos, 6)
    check('obj1.progress = 58', obj1.progress === 58, obj1.progress, 58)
  }
  const obj2 = objects.find((o) => o.clientToken === 'demo-townhaus')
  check('obj2.progress = 25', obj2?.progress === 25, obj2?.progress, 25)
  const obj3 = objects.find((o) => o.clientToken === 'demo-barista')
  check('obj3.progress = 100', obj3?.progress === 100, obj3?.progress, 100)
  check('obj3.total = 85000 (полностью оплачен)', obj3 ? approx(obj3.total, 85000) && approx(obj3.debt, 0) : false)

  console.log('\n== Карточка объекта 1 ==')
  const detail1 = obj1 ? await getObjectDetail(obj1.id) : null
  check('детали объекта 1 получены', !!detail1)
  if (detail1) {
    check('этапов = 6', detail1.stages.length === 6, detail1.stages.length, 6)
    check('этапы по порядку 1..6', detail1.stages.every((s, i) => s.order === i + 1))
    check('актов = 5', detail1.acts.length === 5, detail1.acts.length, 5)
    check('смет = 2', detail1.estimates.length === 2, detail1.estimates.length, 2)
    check('фото = 6', detail1.photos.length === 6, detail1.photos.length, 6)
    const stagePhotos = detail1.stages.reduce((s, st) => s + st.photos.length, 0)
    check('фото по этапам = 5', stagePhotos === 5, stagePhotos, 5)
  }

  console.log('\n== Сметы ==')
  const estimates = await listEstimateBriefs()
  check('всего смет = 4', estimates.length === 4, estimates.length, 4)
  const estA = estimates.find((e) => e.shareToken === 'est-malyarka-demo')
  check('смета А найдена', !!estA)
  if (estA) {
    check('estA.total (с коэфф. 1.3) = 108866.55', approx(estA.total, 108866.55), estA.total, 108866.55)
    check('estA.visible = 31870.8', approx(estA.visible, 31870.8), estA.visible, 31870.8)
    check('estA.hidden = 76995.75', approx(estA.hidden, 76995.75), estA.hidden, 76995.75)
    check('estA.doneSum = 45981', approx(estA.doneSum, 45981), estA.doneSum, 45981)
    check('estA.hiddenShare = 71', estA.hiddenShare === 71, estA.hiddenShare, 71)
    check('estA.progress ≈ 0.422', approx(estA.progress, 0.422, 0.001), estA.progress, 0.422)
    check('estA.lines = 12', estA.lines === 12, estA.lines, 12)
    check('estA.status = approved', estA.status === 'approved', estA.status, 'approved')
  }
  const estDetail = estA ? await getEstimateDetail(estA.id) : null
  check('детали сметы А', !!estDetail)
  if (estDetail) {
    check('строк с sum = 12', estDetail.lines.length === 12, estDetail.lines.length, 12)
    const firstSum = estDetail.lines[0]?.sum
    check('строка 1: 14 × 30 = 420', approx(firstSum ?? 0, 420), firstSum, 420)
    check('комментариев = 2', estDetail.comments.length === 2, estDetail.comments.length, 2)
    check('мастер ответил раньше клиента (по createdAt)', estDetail.comments[0].author === 'master')
    check('объект сметы: Анна Дмитрук', estDetail.object.customer === 'Анна Дмитрук')
  }
  const estB = estimates.find((e) => e.title === 'Черновые работы')
  check('смета Б: total = 27525, progress = 1', estB ? approx(estB.total, 27525) && estB.progress === 1 : false, estB ? [estB.total, estB.progress] : null, [27525, 1])

  console.log('\n== Акты ==')
  const acts = await listActBriefs()
  check('всего актов = 9', acts.length === 9, acts.length, 9)
  const byToken = new Map(objects.map((o) => [o.id, o.clientToken]))
  const a1 = acts.find((a) => byToken.get(a.objectId) === 'demo-tihaya-gavan' && a.actNo === 1)
  check('акт №1 (об.1): total = 4875, paid', a1 ? approx(a1.total, 4875) && a1.status === 'paid' : false, a1 ? [a1.total, a1.status] : null, [4875, 'paid'])
  const a2 = acts.find((a) => byToken.get(a.objectId) === 'demo-tihaya-gavan' && a.actNo === 2)
  check('акт №2 (об.1): total = 21300, partial', a2 ? approx(a2.total, 21300) && a2.status === 'partial' : false, a2 ? [a2.total, a2.status] : null, [21300, 'partial'])
  const a5 = acts.find((a) => byToken.get(a.objectId) === 'demo-tihaya-gavan' && a.actNo === 5)
  check('акт №5 (об.1): total = 5560, unpaid', a5 ? approx(a5.total, 5560) && a5.status === 'unpaid' : false, a5 ? [a5.total, a5.status] : null, [5560, 'unpaid'])
  const search = await listActBriefs({ q: 'тихая' })
  check('поиск «тихая» → 5 актов', search.length === 5, search.length, 5)
  const searchNo = await listActBriefs({ q: '3' })
  check('поиск «3» находит акты с номером 3', searchNo.every((a) => String(a.actNo).includes('3') || a.objectName.toLowerCase().includes('3')))
  const actDetail = a1 ? await getActDetail(a1.id) : null
  check('детали акта №1: 2 строки, 1 оплата', actDetail ? actDetail.lines.length === 2 && actDetail.payments.length === 1 : false)

  console.log('\n== Клиентский кабинет (demo-tihaya-gavan) ==')
  const cabinet = await getClientCabinet('demo-tihaya-gavan')
  check('кабинет найден', !!cabinet)
  if (cabinet) {
    check('masterName = «Мастер — демо»', cabinet.object.masterName === 'Мастер — демо')
    check('смет в кабинете = 2 (approved + done)', cabinet.estimates.length === 2, cabinet.estimates.length, 2)
    check('payments: total = 58950, paid = 38625', approx(cabinet.payments.total, 58950) && approx(cabinet.payments.paid, 38625), cabinet.payments, { total: 58950, paid: 38625 })
    check('фото в кабинете = 6, сортировка по дате desc', cabinet.photos.length === 6 && cabinet.photos[0].createdAt > cabinet.photos[5].createdAt && cabinet.photos[0].caption === 'грунтовка стен — первый слой')
  }
  const unknownCabinet = await getClientCabinet('no-such-token')
  check('неизвестный токен → null (404)', unknownCabinet === null)

  console.log('\n== Парсер позиций ==')
  const p1 = parseLineText('штукатурка 45 м² 260')
  check('«штукатурка 45 м² 260» → 1 позиция', p1.lines.length === 1 && p1.lines[0].qty === 45 && p1.lines[0].unit === 'м²' && p1.lines[0].price === 260, p1.lines[0])
  const p2 = parseLineText('демонтаж 2000')
  check('«демонтаж 2000» → qty 1, price 2000', p2.lines.length === 1 && p2.lines[0].qty === 1 && p2.lines[0].price === 2000, p2.lines[0])
  const p3 = parseLineText('грунтовка 45м2')
  check('«грунтовка 45м2» → qty 45, unit м²', p3.lines.length === 1 && p3.lines[0].qty === 45 && p3.lines[0].unit === 'м²', p3.lines[0])
  const p4 = parseLineText('демонтаж 2000 грн')
  check('«демонтаж 2000 грн» → цена 2000 без валюты', p4.lines.length === 1 && p4.lines[0].price === 2000, p4.lines[0])
  const p5 = parseLineText('шлифовка 45м 50, грунтовка 45')
  check('«шлифовка 45м 50, грунтовка 45» → 2 позиции', p5.lines.length === 2 && !p5.suspicious, p5.lines)
  const p6 = parseLineText('грунтовка 45 шлифовка 45')
  check('«грунтовка 45 шлифовка 45» → suspicious', p6.suspicious && p6.lines.length === 0, p6)
  const p7 = parseLineText('стяжка 45,5 260')
  check('«стяжка 45,5 260» → qty 45.5 (запятая-десятичная)', p7.lines.length === 1 && approx(p7.lines[0].qty, 45.5), p7.lines[0])
  const p8 = parseLineText('стяжка 45 260 покраска 30 120')
  check('мульти без запятой → 2 позиции', p8.lines.length === 2 && !p8.suspicious, p8.lines)

  console.log('\n== Помещения ==')
  check('пресетов = 6', roomPresets.length === 6, roomPresets.length, 6)
  const room = roomPresetByKey('room')
  check('пресет room найден, строк = 6', !!room && room.base.length === 6, room?.base.length, 6)
  if (room) {
    const built = buildRoomLines(room, 20, 2.7, 0)
    const walls = built.find((l) => l.name === 'покраска стен')
    const perimeter = 4 * Math.sqrt(20)
    check(`стены = P·h = ${perimeter.toFixed(2)} × 2.7`, walls ? approx(walls.qty, perimeter * 2.7, 0.05) : false, walls?.qty, perimeter * 2.7)
    const floor = built.find((l) => l.name === 'стяжка пола')
    check('пол = S = 20', floor ? approx(floor.qty, 20) : false, floor?.qty, 20)
    check('скрытая подготовка помечена hidden', built.filter((l) => l.hidden).length === 4, built.filter((l) => l.hidden).length, 4)
  }

  console.log('\n== Прайс и шаблоны ==')
  const priceItems = await db.priceItem.findMany()
  check('прайс = 18 позиций', priceItems.length === 18, priceItems.length, 18)
  const templates = await db.template.findMany()
  check('шаблонов = 4', templates.length === 4, templates.length, 4)
  for (const t of templates) {
    const lines = JSON.parse(t.lines) as unknown[]
    if (!Array.isArray(lines) || lines.length === 0) {
      failures++
      console.log(`  ❌ шаблон «${t.name}»: пустой lines`)
    }
  }
  console.log('  ✅ у всех шаблонов lines — валидный JSON-массив')

  const photos = await db.photo.findMany()
  check('фото = 10', photos.length === 10, photos.length, 10)
  const comments = await db.comment.findMany()
  check('комментариев = 2', comments.length === 2, comments.length, 2)

  console.log(`\n${failures === 0 ? '🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `⚠️ ПРОВАЛОВ: ${failures}`}\n`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => {
    console.error('Ошибка верификации:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
