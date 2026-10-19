// Типовые помещения (v0.6 оригинала): «кухня 9 м²» → готовый набор строк
// с нормами. Потолок = S (площадь), стены = P·h (периметр × высота),
// плинтус/откосы = P (периметр). Скрытая подготовка помечена hidden.

export type RoomSource = 'S' | 'PH' | 'P'

export interface RoomBaseLine {
  name: string
  unit: string
  src: RoomSource
  price: number
  hidden: boolean
}

export interface RoomPreset {
  key: string
  name: string
  hint: string
  base: RoomBaseLine[]
}

export interface BuiltRoomLine {
  name: string
  unit: string
  qty: number
  price: number
  hidden: boolean
}

export const roomPresets: RoomPreset[] = [
  {
    key: 'room',
    name: 'Комната',
    hint: 'полный цикл: стены, пол, покраска',
    base: [
      { name: 'грунтовка стен', unit: 'м²', src: 'PH', price: 25, hidden: true },
      { name: 'штукатурка стен', unit: 'м²', src: 'PH', price: 260, hidden: true },
      { name: 'шпаклёвка стен под покраску', unit: 'м²', src: 'PH', price: 180, hidden: true },
      { name: 'покраска стен', unit: 'м²', src: 'PH', price: 120, hidden: false },
      { name: 'стяжка пола', unit: 'м²', src: 'S', price: 300, hidden: true },
      { name: 'ламинат, укладка', unit: 'м²', src: 'S', price: 180, hidden: false },
    ],
  },
  {
    key: 'kitchen',
    name: 'Кухня',
    hint: 'стены под покраску + плитка на пол',
    base: [
      { name: 'грунтовка стен', unit: 'м²', src: 'PH', price: 25, hidden: true },
      { name: 'штукатурка стен', unit: 'м²', src: 'PH', price: 260, hidden: true },
      { name: 'шпаклёвка стен под покраску', unit: 'м²', src: 'PH', price: 180, hidden: true },
      { name: 'покраска стен', unit: 'м²', src: 'PH', price: 120, hidden: false },
      { name: 'стяжка пола', unit: 'м²', src: 'S', price: 300, hidden: true },
      { name: 'плитка на пол', unit: 'м²', src: 'S', price: 400, hidden: false },
    ],
  },
  {
    key: 'bath',
    name: 'Ванная',
    hint: 'гидроизоляция, плитка, стены под плитку',
    base: [
      { name: 'штукатурка стен', unit: 'м²', src: 'PH', price: 260, hidden: true },
      { name: 'гидроизоляция пола', unit: 'м²', src: 'S', price: 120, hidden: true },
      { name: 'стяжка пола', unit: 'м²', src: 'S', price: 300, hidden: true },
      { name: 'плитка на пол', unit: 'м²', src: 'S', price: 400, hidden: false },
      { name: 'плитка на стены', unit: 'м²', src: 'PH', price: 450, hidden: false },
    ],
  },
  {
    key: 'wc',
    name: 'Туалет',
    hint: 'маленькое помещение — плитка по кругу',
    base: [
      { name: 'штукатурка стен', unit: 'м²', src: 'PH', price: 260, hidden: true },
      { name: 'гидроизоляция пола', unit: 'м²', src: 'S', price: 120, hidden: true },
      { name: 'плитка на пол', unit: 'м²', src: 'S', price: 400, hidden: false },
      { name: 'плитка на стены', unit: 'м²', src: 'PH', price: 450, hidden: false },
    ],
  },
  {
    key: 'hall',
    name: 'Коридор / прихожая',
    hint: 'стены + пол, часто ламинат и плинтус',
    base: [
      { name: 'грунтовка стен', unit: 'м²', src: 'PH', price: 25, hidden: true },
      { name: 'штукатурка стен', unit: 'м²', src: 'PH', price: 260, hidden: true },
      { name: 'шпаклёвка стен под покраску', unit: 'м²', src: 'PH', price: 180, hidden: true },
      { name: 'покраска стен', unit: 'м²', src: 'PH', price: 120, hidden: false },
      { name: 'стяжка пола', unit: 'м²', src: 'S', price: 300, hidden: true },
      { name: 'ламинат, укладка', unit: 'м²', src: 'S', price: 180, hidden: false },
      { name: 'плинтус, монтаж', unit: 'м.п', src: 'P', price: 120, hidden: false },
    ],
  },
  {
    key: 'balcony',
    name: 'Балкон / лоджия',
    hint: 'лёгкий цикл: стены + пол',
    base: [
      { name: 'утепление стен', unit: 'м²', src: 'PH', price: 200, hidden: true },
      { name: 'шпаклёвка стен под покраску', unit: 'м²', src: 'PH', price: 180, hidden: true },
      { name: 'покраска стен', unit: 'м²', src: 'PH', price: 120, hidden: false },
      { name: 'стяжка пола', unit: 'м²', src: 'S', price: 300, hidden: true },
      { name: 'ламинат, укладка', unit: 'м²', src: 'S', price: 180, hidden: false },
    ],
  },
]

export function roomPresetByKey(key: string): RoomPreset | null {
  return roomPresets.find((p) => p.key === key) ?? null
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Объёмы по нормам: S — площадь, h — высота, P — периметр
 *  (если периметр не задан, оцениваем по площади квадратной комнаты: 4·√S). */
export function buildRoomLines(
  preset: RoomPreset,
  area: number,
  height: number,
  perimeter: number
): BuiltRoomLine[] {
  const p = perimeter > 0 ? perimeter : area > 0 ? 4 * Math.sqrt(area) : 0
  const out: BuiltRoomLine[] = []
  for (const b of preset.base) {
    let qty: number
    switch (b.src) {
      case 'S':
        qty = area
        break
      case 'PH':
        qty = p * height
        break
      case 'P':
        qty = p
        break
      default:
        qty = 0
    }
    out.push({ name: b.name, unit: b.unit, qty: round2(qty), price: b.price, hidden: b.hidden })
  }
  return out
}
