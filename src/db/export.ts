// Экспорт XLSX (смета/акт) и текста акта для Telegram.
// Формат колонок повторяет рабочие файлы мастера:
// «вид робіт | м²,шт | м.п | ціна за одиницю | сума | примітки».

import * as XLSX from 'xlsx'
import type { ActFull, EstimateFull } from '@/db/queries'

type Row = (string | number | null)[]

function headerRow(): Row {
  return ['вид робіт', 'м²,шт', 'м.п', 'ціна за одиницю', 'сума', 'примітки']
}

function lineToRow(l: {
  name: string
  qty: number
  unit: string
  price: number
  note?: string
}): Row {
  const isMp = (l.unit || '').toLowerCase().startsWith('м.п') || l.unit === 'м.п'
  const isSq = (l.unit || '').includes('м²') || (l.unit || '').includes('м2')
  return [
    l.name,
    isSq ? l.qty : null,
    isMp ? l.qty : null,
    l.price,
    Math.round(l.qty * l.price * 100) / 100,
    l.note ?? '',
  ]
}

function buildSheet(
  rows: Row[],
  total: number,
  opts: { hiddenFlags?: Map<number, boolean> } = {}
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headerRow(), ...rows, ['Загальна сума', null, null, null, total, '']])
  ws['!cols'] = [{ wch: 58 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 13 }, { wch: 22 }]
  ws['!rows'] = [{ hpx: 22 }]
  // жирный заголовок и итог
  const lastIdx = rows.length + 1
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  for (const idx of [0, lastIdx]) {
    const cellRef = XLSX.utils.encode_cell({ c: 0, r: idx })
    if (ws[cellRef]) (ws[cellRef] as { s?: unknown }).s = { font: { bold: true } }
  }
  void opts.hiddenFlags
  return ws
}

export function estimateToXlsx(
  estimate: EstimateFull,
  meta: { objectName: string; customer: string }
): Buffer {
  const lines = [...estimate.lines].sort((a, b) => a.pos - b.pos)
  const rows: Row[] = lines.map((l) => lineToRow(l))
  const rawTotal = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const total = Math.round(rawTotal * estimate.coeff * 100) / 100
  const wb = XLSX.utils.book_new()
  const ws = buildSheet(rows, total)
  XLSX.utils.book_append_sheet(wb, ws, 'Кошторис')
  const info = XLSX.utils.aoa_to_sheet([
    ['Об\'єкт', meta.objectName],
    ['Замовник', meta.customer],
    ['Документ', estimate.title],
    ['Коефіцієнт', estimate.coeff],
    ['Дата', new Date().toISOString().slice(0, 10)],
  ])
  info['!cols'] = [{ wch: 14 }, { wch: 46 }]
  XLSX.utils.book_append_sheet(wb, info, 'Інформація')
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return out
}

export function actToXlsx(
  act: ActFull,
  meta: { objectName: string; customer: string }
): Buffer {
  const lines = [...act.lines].sort((a, b) => a.pos - b.pos)
  const rows: Row[] = lines.map((l) => lineToRow(l))
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100
  const wb = XLSX.utils.book_new()
  const ws = buildSheet(rows, total)
  XLSX.utils.book_append_sheet(wb, ws, `Акт ${act.actNo}`)
  const paid = act.payments.reduce((s, p) => s + p.amount, 0)
  const info = XLSX.utils.aoa_to_sheet([
    ['Об\'єкт', meta.objectName],
    ['Замовник', meta.customer],
    ['Акт №', act.actNo],
    ['Період', act.periodFrom ? new Date(act.periodFrom).toISOString().slice(0, 10) : '', act.periodTo ? new Date(act.periodTo).toISOString().slice(0, 10) : ''],
    ['Дата', new Date(act.date).toISOString().slice(0, 10)],
    ['До сплати', Math.round((total - paid) * 100) / 100],
  ])
  info['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, info, 'Інформація')
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return out
}

// --- текст акта для Telegram: как мастер шлёт заказчику --------------------------

export type ActTextLine = { name: string; qty: number; unit: string; price: number; section: string }

export function actToTelegramText(
  actNo: number,
  lines: ActTextLine[],
  meta: {
    total: number
    objectName?: string
    periodFrom?: string | null
    periodTo?: string | null
    lang?: string
  }
): string {
  const uk = meta.lang === 'uk'
  const sectionTitles: Record<string, string> = {
    'стены': uk ? 'Малярні роботи на стінах' : 'Малярные работы на стенах',
    'потолки': uk ? 'Малярні роботи на стелях' : 'Малярные работы на потолках',
    'доп': uk ? 'Додаткові роботи' : 'Дополнительные работы',
    'подготовка': uk ? 'Підготовчі роботи' : 'Подготовительные работы',
    'двери скрытого монтажа': uk ? 'Двері прихованого монтажу' : 'Двери скрытого монтажа',
    'материалы': uk ? 'Матеріали' : 'Материалы',
  }
  const fmt = (n: number): string =>
    Number.isInteger(n) ? String(n) : String(n).replace('.', ',')

  const out: string[] = []
  out.push(uk ? `Акт виконаних робіт №${actNo}` : `Акт выполненных работ №${actNo}`)
  if (meta.periodFrom || meta.periodTo) {
    const f = meta.periodFrom ? meta.periodFrom.slice(0, 10) : ''
    const t = meta.periodTo ? meta.periodTo.slice(0, 10) : ''
    out.push(uk ? `період: ${f} — ${t}` : `период: ${f} — ${t}`)
  }
  out.push('')

  let currentSection = '__start__'
  for (const l of lines) {
    const sec = (l.section || '').trim()
    if (sec && sec !== currentSection) {
      if (currentSection !== '__start__') out.push('')
      out.push(sectionTitles[sec] ?? sec)
      currentSection = sec
    }
    const sum = Math.round(l.qty * l.price * 100) / 100
    out.push(`${l.name}`)
    out.push(`${fmt(l.price)}грн × ${fmt(l.qty)}${l.unit ? l.unit.replace('м.п', 'м.п') : ''} =${fmt(sum)}грн`)
  }
  out.push('')
  out.push(uk ? `Загальна сума ${fmt(meta.total)}грн` : `Общая сумма ${fmt(meta.total)}грн`)
  return out.join('\n')
}
