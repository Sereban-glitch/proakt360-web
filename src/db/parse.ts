// Порт парсера позиций из оригинального репозитория proakt-build-bot
// (internal/parse/{parse,tokenize,unit}.go), упрощённый под прототип.
//
// Поддерживаемые форматы:
//   «штукатурка 45 м² 260»     → наименование, количество, единица, цена
//   «демонтаж 2000»            → наименование + готовая сумма (qty=1)
//   «штукатурка 45м»           → слитые число+единица разрезаются
//   «грунтовка 45 м2»          → м2 → м²
//   «демонтаж 2000 грн»        → валюта выбрасывается
//   «а 45 м² 260, б 30 м² 120» → несколько позиций через запятую
//   «грунтовка 45 шлифовка 45»  → suspicious=true (деньги святы — переспрашиваем)

export interface DraftLine {
  name: string
  qty: number
  unit: string
  price: number
  sum: number
}

export interface ParseResult {
  suspicious: boolean
  lines: DraftLine[]
}

// --- единицы измерения ---------------------------------------------------------

const unitAliases: Record<string, string> = {
  'м2': 'м²', 'м²': 'м²', 'кв.м': 'м²', 'кв.м.': 'м²', 'кв': 'м²', 'кв.': 'м²',
  'квадрат': 'м²', 'квадрата': 'м²', 'квадратов': 'м²', 'квм': 'м²',
  'м.п': 'м.п.', 'м.п.': 'м.п.', 'мп': 'м.п.', 'мп.': 'м.п.', 'м/п': 'м.п.',
  'пог.м': 'м.п.', 'пог.м.': 'м.п.', 'погонный': 'м.п.', 'погонные': 'м.п.',
  'шт': 'шт', 'шт.': 'шт', 'штука': 'шт', 'штуки': 'шт', 'штук': 'шт',
  'кг': 'кг', 'кг.': 'кг', 'л': 'л', 'литр': 'л', 'литров': 'л',
  'м3': 'м³', 'м³': 'м³', 'куб': 'м³', 'куба': 'м³', 'кубов': 'м³',
  'уп': 'уп', 'уп.': 'уп', 'упак': 'уп', 'упаковка': 'уп',
  'м': 'м', 'м.': 'м', 'метр': 'м', 'метра': 'м', 'метров': 'м',
}

const CURRENCY_WORDS = new Set([
  'грн', 'грн.', 'гривна', 'гривну', 'гривні', 'гривен', 'гривны', 'uah', '₴',
])

/** Канонический вид единицы; '' — не похоже на единицу. */
export function normalizeUnit(s: string): string {
  const t = s.toLowerCase().trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '')
  if ([...t].length > 12) return ''
  return unitAliases[t] ?? ''
}

/** Нормализация наименования прайса: нижний регистр, ё→е, без лишних пробелов. */
export function normName(s: string): string {
  let out = s.toLowerCase().trim().replace(/\u00a0/g, ' ').replace(/ё/g, 'е')
  while (out.includes('  ')) out = out.replace(/  /g, ' ')
  return out
}

function isCurrency(s: string): boolean {
  const low = s.toLowerCase().trim()
  return CURRENCY_WORDS.has(low) || CURRENCY_WORDS.has(low.replace(/^[.,]+|[.,]+$/g, ''))
}

// --- числа ----------------------------------------------------------------------

function isNumber(s: string): boolean {
  let t = s.replace(/,/g, '.')
  if (t !== '' && (t[0] === '-' || t[0] === '+')) t = t.slice(1)
  if (t === '') return false
  let dots = 0
  let digits = 0
  for (const ch of t) {
    if (ch >= '0' && ch <= '9') digits++
    else if (ch === '.') {
      dots++
      if (dots > 1) return false
    } else return false
  }
  return digits > 0
}

function toFloat(s: string): number | null {
  const v = Number(s.replace(/,/g, '.'))
  return Number.isFinite(v) ? v : null
}

// --- токенизация ----------------------------------------------------------------

interface NumSuffix {
  num: string
  rest: string
}

/** «45м» → ("45","м"); «2000грн» → ("2000","") ; null — не число+суффикс. */
function splitNumSuffix(f: string): NumSuffix | null {
  const r = [...f]
  let best = -1
  for (let i = 1; i < r.length; i++) {
    if (!isNumber(r.slice(0, i).join(''))) break
    const tail = r.slice(i).join('')
    if (normalizeUnit(tail) !== '' || isCurrency(tail)) best = i
  }
  if (best < 1) return null
  const tail = r.slice(best).join('')
  if (isCurrency(tail)) return { num: r.slice(0, best).join(''), rest: '' }
  return { num: r.slice(0, best).join(''), rest: tail }
}

/** Слова строки с разрезанием слитых «число+единица» и без валюты. */
export function tokenize(s: string): string[] {
  const out: string[] = []
  for (const f of s.replace(/\u00a0/g, ' ').split(/\s+/).filter(Boolean)) {
    if (isCurrency(f)) continue
    const sp = splitNumSuffix(f)
    if (!sp) {
      out.push(f)
      continue
    }
    if (sp.rest === '') {
      out.push(sp.num)
      continue
    }
    if (normalizeUnit(sp.rest) !== '') {
      out.push(sp.num, sp.rest)
      continue
    }
    out.push(f)
  }
  return out
}

/** Похоже на несколько позиций, которые не смогли уверенно разрезать:
 *  чисел ≥ 2 и между крайними есть обычное слово (не единица). */
export function suspiciousMulti(s: string): boolean {
  const toks = tokenize(s)
  let first = -1
  let last = -1
  for (let i = 0; i < toks.length; i++) {
    if (isNumber(toks[i])) {
      if (first < 0) first = i
      last = i
    }
  }
  if (first < 0 || last === first) return false
  for (let i = first + 1; i < last; i++) {
    if (!isNumber(toks[i]) && normalizeUnit(toks[i]) === '') return true
  }
  return false
}

/** Делит часть строки на сегменты по границе «единица/цена → обычное слово». */
export function splitPositions(s: string): string[] | null {
  const toks = tokenize(s)
  if (toks.length < 4) return null
  const segs: string[] = []
  let cur: string[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    cur.push(t)
    if (i === toks.length - 1) break
    const next = toks[i + 1]
    if (isNumber(next) || normalizeUnit(next) !== '') continue
    let boundary = normalizeUnit(t) !== ''
    if (!boundary && isNumber(t) && i > 0 && (isNumber(toks[i - 1]) || normalizeUnit(toks[i - 1]) !== '')) {
      boundary = true
    }
    if (boundary) {
      segs.push(cur.join(' '))
      cur = []
    }
  }
  if (cur.length > 0) segs.push(cur.join(' '))
  if (segs.length < 2) return null
  return segs
    .map((seg) => {
      let out = seg.trim()
      for (const lead of ['и ', 'і ', '+ ', 'плюс ']) {
        while (out.startsWith(lead)) out = out.slice(lead.length).trim()
      }
      return out.trim()
    })
    .filter(Boolean)
}

/** Разбор ОДНОЙ позиции: «штукатурка 45 м² 260» / «демонтаж 2000» /
 *  «штукатурка 45 м²» (без цены → qty+unit, price=0). */
export function parsePosition(s: string): DraftLine | null {
  const fields = tokenize(s)
  if (fields.length === 0) return null

  const numIdx: number[] = []
  for (let i = 0; i < fields.length; i++) {
    if (isNumber(fields[i])) numIdx.push(i)
  }

  let line: DraftLine | null = null
  if (numIdx.length >= 2) {
    const qtyIdx = numIdx[0]
    const priceIdx = numIdx[numIdx.length - 1]
    const qty = toFloat(fields[qtyIdx])
    const price = toFloat(fields[priceIdx])
    if (qty === null || price === null || qty <= 0 || price <= 0) return null
    const name = fields.slice(0, qtyIdx).join(' ').trim()
    if (!name) return null
    let unit = ''
    if (qtyIdx + 1 < priceIdx) {
      const u = normalizeUnit(fields[qtyIdx + 1])
      if (u) unit = u
    }
    line = { name, qty, unit, price, sum: qty * price }
  } else if (numIdx.length === 1) {
    const idx = numIdx[0]
    const v = toFloat(fields[idx])
    if (v === null || v <= 0) return null
    // единица после числа: «штукатурка 45 м²» → количество, цены нет (из прайса)
    const afterUnit = idx + 1 < fields.length ? normalizeUnit(fields[idx + 1]) : ''
    if (afterUnit) {
      const name = fields.slice(0, idx).join(' ').trim()
      if (name) line = { name, qty: v, unit: afterUnit, price: 0, sum: 0 }
    } else if (idx >= 2 && !isNumber(fields[idx - 1])) {
      // единица перед числом: «штукатурка м² 45»
      const beforeUnit = normalizeUnit(fields[idx - 1])
      if (beforeUnit) {
        const name = fields.slice(0, idx - 1).join(' ').trim()
        if (name) line = { name, qty: v, unit: beforeUnit, price: 0, sum: 0 }
      }
    }
    if (!line) {
      // сумма за всё: «демонтаж 2000»
      const name = fields.filter((_, i) => i !== idx).join(' ').trim()
      if (!name) return null
      line = { name, qty: 1, unit: '', price: v, sum: v }
    }
  } else {
    return null
  }

  line.name = line.name.replace(/^[ ,.-]+|[ ,.-]+$/g, '')
  if (!line.name) return null
  return line
}

/** Разбивает строку на части-кандидаты по запятой/точке с запятой/переводу строки
 *  (десятичная запятая «45,5» сохраняется). */
function splitByComma(text: string): string[] {
  const t = text.replace(/\u00a0/g, ' ').replace(/(\d),(\d)/g, '$1.$2')
  return t
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Главная функция: разбор произвольной строки мастера в позиции для предпросмотра.
 *  Если строка похожа на несколько позиций без цен — suspicious=true, lines=[]:
 *  лучше переспросить, чем молча записать неверные деньги. */
export function parseLineText(text: string): ParseResult {
  const parts = splitByComma(text)
  const candidates = parts.length > 0 ? parts : [text.trim()]

  const lines: DraftLine[] = []
  let unresolved = false
  for (const part of candidates) {
    const p = part.replace(/\s+/g, ' ').trim()
    if (!p) continue
    const segs = splitPositions(p) ?? [p]
    for (const seg of segs) {
      if (suspiciousMulti(seg)) {
        unresolved = true
        continue
      }
      const dl = parsePosition(seg)
      if (dl) {
        lines.push(dl)
      } else if (tokenize(seg).some(isNumber)) {
        // сегмент с числами не разобрался — молча терять деньги нельзя
        unresolved = true
      }
    }
  }

  if (unresolved) return { suspicious: true, lines: [] }
  return { suspicious: false, lines }
}
