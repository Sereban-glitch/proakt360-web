// Общие вычисления и выборки для API «ПрорАКТ 360» v2.
// Все денежные суммы считаются на сервере (грн, числа): roundMoney = 2 знака.

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Stage } from '@prisma/client'
import { resolveClientToken } from './auth'

// --- типы ответов (camelCase) ---------------------------------------------------

export type PhotoBrief = {
  id: number
  objectId: number
  actId: number | null
  actNo: number
  stageId: number | null
  estimateLineId: number | null
  kind: string
  storage: string
  caption: string
  visible: boolean
  takenAt: string | null
  createdAt: string
  thumbUrl: string
  fileUrl: string
}

export type ActStatus = 'paid' | 'partial' | 'unpaid' | 'zero'

export type ActBrief = {
  id: number
  actNo: number
  objectId: number
  objectName: string
  customer: string
  date: string
  periodFrom: string | null
  periodTo: string | null
  token: string
  total: number
  paid: number
  photos: number
  status: ActStatus
}

export type EstimateBrief = {
  id: number
  objectId: number
  objectName: string
  title: string
  status: string
  coeff: number
  note: string
  shareToken: string | null
  sentAt: string | null
  approvedAt: string | null
  createdAt: string
  lines: number
  total: number
  visible: number
  hidden: number
  doneSum: number
  actedSum: number
  remainingSum: number
  hiddenShare: number
  progress: number
}

export type ObjectBrief = {
  id: number
  name: string
  customer: string
  address: string
  status: string
  deadline: string | null
  clientToken: string
  locale: string
  createdAt: string
  acts: number
  total: number
  paid: number
  photos: number
  debt: number
  progress: number
}

// --- округления -----------------------------------------------------------------

export function roundMoney(v: number): number {
  return Math.round(v * 100) / 100
}

// --- includes (типизированные через Prisma.validator) ----------------------------

export const ACT_FULL_INCLUDE = Prisma.validator<Prisma.ActInclude>()({
  lines: true,
  payments: true,
  photos: true,
  object: { select: { name: true, customer: true, clientToken: true } },
})

export const ESTIMATE_FULL_INCLUDE = Prisma.validator<Prisma.EstimateInclude>()({
  lines: true,
  object: { select: { name: true } },
})

export const OBJECT_BRIEF_INCLUDE = Prisma.validator<Prisma.BuildObjectInclude>()({
  stages: true,
  acts: { include: { lines: true, payments: true } },
  _count: { select: { photos: true } },
})

const PHOTO_ACT_INCLUDE = Prisma.validator<Prisma.PhotoInclude>()({
  act: { select: { actNo: true } },
})
export type ActFull = Prisma.ActGetPayload<{ include: typeof ACT_FULL_INCLUDE }>
export type EstimateFull = Prisma.EstimateGetPayload<{ include: typeof ESTIMATE_FULL_INCLUDE }>
export type ObjectFull = Prisma.BuildObjectGetPayload<{ include: typeof OBJECT_BRIEF_INCLUDE }>
export type PhotoWithAct = Prisma.PhotoGetPayload<{ include: typeof PHOTO_ACT_INCLUDE }>
export type StageWithPhotoBriefs = Stage & { photos: PhotoBrief[] }

// --- брифы ----------------------------------------------------------------------

export function photoBrief(p: PhotoWithAct, clientToken?: string): PhotoBrief {
  const t = clientToken ? `?token=${encodeURIComponent(clientToken)}` : ''
  return {
    id: p.id,
    objectId: p.objectId,
    actId: p.actId,
    actNo: p.act?.actNo ?? 0,
    stageId: p.stageId,
    estimateLineId: p.estimateLineId,
    kind: p.kind,
    storage: p.storage,
    caption: p.caption,
    visible: p.visible,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    thumbUrl: `/api/photo/${p.id}/file?thumb=1${t ? `&${t.slice(1)}` : ''}`,
    fileUrl: `/api/photo/${p.id}/file${t}`,
  }
}

export function actBrief(a: ActFull): ActBrief {
  const total = roundMoney(a.lines.reduce((s, l) => s + l.qty * l.price, 0))
  const paid = roundMoney(a.payments.reduce((s, p) => s + p.amount, 0))
  const debt = Math.max(0, roundMoney(total - paid))
  let status: ActStatus = 'unpaid'
  if (Math.abs(total) < 0.01) status = 'zero'
  else if (debt < 0.01) status = 'paid'
  else if (paid > 0) status = 'partial'
  return {
    id: a.id,
    actNo: a.actNo,
    objectId: a.objectId,
    objectName: a.object.name,
    customer: a.object.customer,
    date: a.date.toISOString(),
    periodFrom: a.periodFrom ? a.periodFrom.toISOString() : null,
    periodTo: a.periodTo ? a.periodTo.toISOString() : null,
    token: a.token,
    total,
    paid,
    photos: a.photos.length,
    status,
  }
}

export function estimateBrief(e: EstimateFull): EstimateBrief {
  const rawTotal = e.lines.reduce((s, l) => s + l.qty * l.price, 0)
  const rawVisible = e.lines.filter((l) => !l.hidden).reduce((s, l) => s + l.qty * l.price, 0)
  const rawHidden = e.lines.filter((l) => l.hidden).reduce((s, l) => s + l.qty * l.price, 0)
  // по факту включённого в акты объёма (doneQty), а не по бинарному флагу
  const rawActed = e.lines.reduce((s, l) => s + Math.min(l.doneQty, l.qty) * l.price, 0)
  const total = roundMoney(rawTotal * e.coeff)
  const visible = roundMoney(rawVisible * e.coeff)
  const hidden = roundMoney(rawHidden * e.coeff)
  const actedSum = roundMoney(rawActed * e.coeff)
  const remainingSum = roundMoney(Math.max(0, total - actedSum))
  const hiddenShare = total > 0 ? Math.round((hidden / total) * 100) : 0
  const progress = total > 0 ? Math.round((actedSum / total) * 1000) / 1000 : 0
  return {
    id: e.id,
    objectId: e.objectId,
    objectName: e.object.name,
    title: e.title,
    status: e.status,
    coeff: e.coeff,
    note: e.note,
    shareToken: e.shareToken,
    sentAt: e.sentAt ? e.sentAt.toISOString() : null,
    approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    lines: e.lines.length,
    total,
    visible,
    hidden,
    doneSum: actedSum,
    actedSum,
    remainingSum,
    hiddenShare,
    progress,
  }
}

function stageWeight(status: string): number {
  if (status === 'done') return 1
  if (status === 'current') return 0.5
  return 0
}

export function objectBrief(o: ObjectFull): ObjectBrief {
  let total = 0
  let paid = 0
  for (const a of o.acts) {
    total += a.lines.reduce((s, l) => s + l.qty * l.price, 0)
    paid += a.payments.reduce((s, p) => s + p.amount, 0)
  }
  total = roundMoney(total)
  paid = roundMoney(paid)
  const debt = Math.max(0, roundMoney(total - paid))
  const progress = o.stages.length
    ? Math.round((o.stages.reduce((s, st) => s + stageWeight(st.status), 0) / o.stages.length) * 100)
    : 0
  return {
    id: o.id,
    name: o.name,
    customer: o.customer,
    address: o.address,
    status: o.status,
    deadline: o.deadline ? o.deadline.toISOString() : null,
    clientToken: o.clientToken,
    locale: o.locale,
    createdAt: o.createdAt.toISOString(),
    acts: o.acts.length,
    total,
    paid,
    photos: o._count.photos,
    debt,
    progress,
  }
}

function byDateDesc(a: { date: string; id: number }, b: { date: string; id: number }): number {
  return b.date.localeCompare(a.date) || b.id - a.id
}

function byCreatedDesc(a: { createdAt: string; id: number }, b: { createdAt: string; id: number }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id
}

// --- списки ---------------------------------------------------------------------

export async function listObjectBriefs(): Promise<ObjectBrief[]> {
  const objects = await db.buildObject.findMany({ include: OBJECT_BRIEF_INCLUDE })
  return objects
    .map(objectBrief)
    .sort((a, b) => {
      const activeA = a.status === 'active' ? 0 : 1
      const activeB = b.status === 'active' ? 0 : 1
      if (activeA !== activeB) return activeA - activeB
      return b.createdAt.localeCompare(a.createdAt)
    })
}

export async function listEstimateBriefs(objectId?: number): Promise<EstimateBrief[]> {
  const list = await db.estimate.findMany({
    where: objectId ? { objectId } : undefined,
    include: ESTIMATE_FULL_INCLUDE,
  })
  return list.map(estimateBrief).sort(byCreatedDesc)
}

export async function listActBriefs(filter: { objectId?: number; q?: string } = {}): Promise<ActBrief[]> {
  const acts = await db.act.findMany({ include: ACT_FULL_INCLUDE })
  let briefs = acts.map(actBrief)
  if (filter.objectId) briefs = briefs.filter((a) => a.objectId === filter.objectId)
  if (filter.q && filter.q.trim() !== '') {
    const q = filter.q.trim().toLowerCase()
    briefs = briefs.filter(
      (a) => a.objectName.toLowerCase().includes(q) || String(a.actNo).includes(q)
    )
  }
  return briefs.sort(byDateDesc)
}

// --- детали ---------------------------------------------------------------------

export async function getObjectDetail(id: number) {
  const object = await db.buildObject.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { order: 'asc' as const },
        include: { photos: { orderBy: { createdAt: 'desc' as const }, include: PHOTO_ACT_INCLUDE } },
      },
      acts: { include: { lines: true, payments: true } },
      estimates: { include: ESTIMATE_FULL_INCLUDE },
      _count: { select: { photos: true } },
    },
  })
  if (!object) return null
  const [photos, actsFull] = await Promise.all([
    db.photo.findMany({
      where: { objectId: id },
      orderBy: { createdAt: 'desc' as const },
      include: PHOTO_ACT_INCLUDE,
    }),
    db.act.findMany({ where: { objectId: id }, include: ACT_FULL_INCLUDE }),
  ])
  return {
    object: objectBrief(object),
    stages: object.stages.map((s) => ({ ...s, photos: s.photos.map((p) => photoBrief(p)) })) satisfies StageWithPhotoBriefs[],
    acts: actsFull.map(actBrief).sort(byDateDesc),
    estimates: object.estimates.map(estimateBrief).sort(byCreatedDesc),
    photos: photos.map((p) => photoBrief(p)),
  }
}

export async function getEstimateDetail(id: number) {
  const estimate = await db.estimate.findUnique({
    where: { id },
    include: {
      lines: true,
      comments: { orderBy: { createdAt: 'asc' as const } },
      object: { select: { name: true, customer: true, clientToken: true } },
    },
  })
  if (!estimate) return null
  return {
    estimate: estimateBrief(estimate),
    lines: [...estimate.lines]
      .sort((a, b) => a.pos - b.pos)
      .map((l) => ({
        ...l,
        sum: roundMoney(l.qty * l.price),
        remainingQty: roundMoney(Math.max(0, l.qty - l.doneQty)),
        actedSum: roundMoney(Math.min(l.doneQty, l.qty) * l.price),
      })),
    comments: estimate.comments,
    object: {
      name: estimate.object.name,
      customer: estimate.object.customer,
      clientToken: estimate.object.clientToken,
    },
  }
}

export async function getActDetail(id: number) {
  const act = await db.act.findUnique({
    where: { id },
    include: {
      lines: true,
      payments: { orderBy: { at: 'asc' as const } },
      photos: { orderBy: { createdAt: 'desc' as const }, include: PHOTO_ACT_INCLUDE },
      object: { select: { name: true, customer: true, clientToken: true } },
    },
  })
  if (!act) return null
  return {
    act: actBrief(act),
    lines: [...act.lines]
      .sort((a, b) => a.pos - b.pos)
      .map((l) => ({ ...l, sum: roundMoney(l.qty * l.price) })),
    payments: act.payments,
    photos: act.photos.map((p) => photoBrief(p)),
  }
}

// --- создание акта из строк сметы (защита от двойного включения) ------------------

export type ActFromEntry = { lineId: number; qty: number }

export async function createActFromEstimateLines(params: {
  objectId: number
  estimateId: number
  entries: ActFromEntry[]
  periodFrom?: string | null
  periodTo?: string | null
  note?: string
}): Promise<{ ok: true; actId: number; actNo: number } | { ok: false; error: string; code: number }> {
  const { objectId, estimateId, entries } = params
  if (!entries.length) return { ok: false, error: 'Не выбраны строки', code: 400 }
  const estimate = await db.estimate.findUnique({
    where: { id: estimateId },
    include: { lines: true },
  })
  if (!estimate || estimate.objectId !== objectId) {
    return { ok: false, error: 'Смета не найдена', code: 404 }
  }
  const lineMap = new Map(estimate.lines.map((l) => [l.id, l]))

  const prepared: { line: (typeof estimate.lines)[number]; qty: number }[] = []
  for (const e of entries) {
    const line = lineMap.get(e.lineId)
    if (!line) return { ok: false, error: `Строка ${e.lineId} не принадлежит смете`, code: 400 }
    const remaining = roundMoney(line.qty - line.doneQty)
    const qty = roundMoney(e.qty)
    if (qty <= 0) return { ok: false, error: 'Объём должен быть больше нуля', code: 400 }
    if (qty > remaining + 0.001) {
      return {
        ok: false,
        error: `«${line.name}»: нельзя включить ${qty}, осталось ${remaining} ${line.unit || ''}`,
        code: 409,
      }
    }
    prepared.push({ line, qty })
  }

  const last = await db.act.findFirst({ where: { objectId }, orderBy: { actNo: 'desc' } })
  const actNo = (last?.actNo ?? 0) + 1
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)

  const act = await db.act.create({
    data: {
      objectId,
      actNo,
      date: new Date(),
      periodFrom: params.periodFrom ? new Date(params.periodFrom) : null,
      periodTo: params.periodTo ? new Date(params.periodTo) : null,
      note: params.note ?? '',
      token,
      lines: {
        create: prepared.map((p, i) => ({
          pos: i + 1,
          name: p.line.name,
          qty: p.qty,
          unit: p.line.unit,
          price: p.line.price,
          section: p.line.section,
          note: p.line.note,
          estimateLineId: p.line.id,
        })),
      },
    },
  })

  // увеличиваем doneQty ровно на включённый объём
  for (const p of prepared) {
    const line = p.line
    const doneQty = roundMoney(Math.min(line.qty, line.doneQty + p.qty))
    await db.estimateLine.update({
      where: { id: line.id },
      data: { doneQty, done: doneQty >= line.qty - 0.001 },
    })
  }

  return { ok: true, actId: act.id, actNo }
}

// --- клиентский кабинет (единый токен: объект | смета | акт) ---------------------

export async function getClientCabinet(token: string) {
  const resolved = await resolveClientToken(token)
  if (!resolved.ok) return null
  const objectId = resolved.objectId
  const object = await db.buildObject.findUnique({
    where: { id: objectId },
    include: {
      stages: {
        orderBy: { order: 'asc' as const },
        include: { photos: { orderBy: { createdAt: 'desc' as const }, include: PHOTO_ACT_INCLUDE } },
      },
      acts: { include: { lines: true, payments: true } },
      estimates: { where: { status: { in: ['sent', 'approved', 'done'] } }, include: ESTIMATE_FULL_INCLUDE },
      _count: { select: { photos: true } },
    },
  })
  if (!object) return null
  const settings = await db.appSettings.findUnique({ where: { id: 1 } })
  const [photos, actsFull] = await Promise.all([
    db.photo.findMany({
      where: { objectId, visible: true },
      orderBy: { createdAt: 'desc' as const },
      include: PHOTO_ACT_INCLUDE,
    }),
    db.act.findMany({ where: { objectId }, include: ACT_FULL_INCLUDE }),
  ])
  let payTotal = 0
  let payPaid = 0
  for (const a of actsFull) {
    payTotal += a.lines.reduce((s, l) => s + l.qty * l.price, 0)
    payPaid += a.payments.reduce((s, p) => s + p.amount, 0)
  }
  const ct = object.clientToken
  return {
    object: {
      ...objectBrief(object),
      masterName: settings?.masterName || '',
      companyName: settings?.companyName || '',
    },
    focus: resolved.kind === 'estimate' ? { kind: 'estimate', id: resolved.refId } : resolved.kind === 'act' ? { kind: 'act', id: resolved.refId } : null,
    stages: object.stages.map((s) => ({ ...s, photos: s.photos.filter((p) => p.visible).map((p) => photoBrief(p, ct)) })) satisfies StageWithPhotoBriefs[],
    estimates: object.estimates.map(estimateBrief).sort(byCreatedDesc),
    acts: actsFull.map(actBrief).sort(byDateDesc),
    photos: photos.map((p) => photoBrief(p, ct)),
    payments: { total: roundMoney(payTotal), paid: roundMoney(payPaid) },
  }
}

// --- дашборд ----------------------------------------------------------------------

export interface DashboardPayload {
  stats: {
    objects: number
    acts: number
    total: number
    paid: number
    photos: number
    zeroActs: number
    unpaidActs: number
  }
  priceCount: number
  debtTotal: number
  debts: ActBrief[]
  recentActs: ActBrief[]
  activeEstimates: EstimateBrief[]
}

export async function getDashboard(): Promise<DashboardPayload> {
  const [acts, objects, photos, priceCount, activeEstimateRows] = await Promise.all([
    db.act.findMany({ include: ACT_FULL_INCLUDE }),
    db.buildObject.count(),
    db.photo.count(),
    db.priceItem.count(),
    db.estimate.findMany({ where: { status: { not: 'done' } }, include: ESTIMATE_FULL_INCLUDE }),
  ])
  const briefs = acts.map(actBrief)
  const total = roundMoney(briefs.reduce((s, a) => s + a.total, 0))
  const paid = roundMoney(briefs.reduce((s, a) => s + a.paid, 0))
  const unpaid = briefs.filter((a) => a.status === 'partial' || a.status === 'unpaid')
  const debtTotal = roundMoney(
    unpaid.reduce((s, a) => s + Math.max(0, roundMoney(a.total - a.paid)), 0)
  )
  return {
    stats: {
      objects,
      acts: briefs.length,
      total,
      paid,
      photos,
      zeroActs: briefs.filter((a) => a.status === 'zero').length,
      unpaidActs: unpaid.length,
    },
    priceCount,
    debtTotal,
    debts: [...unpaid].sort(byDateDesc).slice(0, 10),
    recentActs: [...briefs].sort(byDateDesc).slice(0, 5),
    activeEstimates: activeEstimateRows.map(estimateBrief).sort(byCreatedDesc),
  }
}

// --- бэкап / восстановление --------------------------------------------------------

export type BackupPayload = {
  version: 2
  createdAt: string
  settings: unknown
  objects: unknown
  stages: unknown
  estimates: unknown
  estimateLines: unknown
  acts: unknown
  actLines: unknown
  payments: unknown
  photos: unknown
  priceItems: unknown
  templates: unknown
  comments: unknown
}

export async function makeBackup(): Promise<BackupPayload> {
  const [
    settings, objects, stages, estimates, estimateLines,
    acts, actLines, payments, photos, priceItems, templates, comments,
  ] = await Promise.all([
    db.appSettings.findFirst(),
    db.buildObject.findMany({ orderBy: { id: 'asc' } }),
    db.stage.findMany({ orderBy: { id: 'asc' } }),
    db.estimate.findMany({ orderBy: { id: 'asc' } }),
    db.estimateLine.findMany({ orderBy: { id: 'asc' } }),
    db.act.findMany({ orderBy: { id: 'asc' } }),
    db.actLine.findMany({ orderBy: { id: 'asc' } }),
    db.payment.findMany({ orderBy: { id: 'asc' } }),
    db.photo.findMany({ orderBy: { id: 'asc' } }),
    db.priceItem.findMany({ orderBy: { id: 'asc' } }),
    db.template.findMany({ orderBy: { id: 'asc' } }),
    db.comment.findMany({ orderBy: { id: 'asc' } }),
  ])
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    settings,
    objects,
    stages,
    estimates,
    estimateLines,
    acts,
    actLines,
    payments,
    photos,
    priceItems,
    templates,
    comments,
  }
}

type AnyRecord = Record<string, unknown>

function reviveDates(obj: AnyRecord, keys: string[]): AnyRecord {
  const out: AnyRecord = { ...obj }
  for (const k of keys) {
    const v = out[k]
    if (typeof v === 'string') out[k] = new Date(v)
    else if (v === null || v === undefined) out[k] = null
  }
  return out
}

export async function restoreBackup(
  data: BackupPayload
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  if (!data || data.version !== 2 || !Array.isArray(data.objects)) {
    return { ok: false, error: 'Некорректный файл бэкапа (ожидается version: 2)' }
  }
  try {
    await db.$transaction(async (tx) => {
      // подчистая восстанавливаем (сессии не трогаем — вход сохраняется)
      await tx.comment.deleteMany()
      await tx.template.deleteMany()
      await tx.priceItem.deleteMany()
      await tx.photo.deleteMany()
      await tx.payment.deleteMany()
      await tx.actLine.deleteMany()
      await tx.act.deleteMany()
      await tx.estimateLine.deleteMany()
      await tx.estimate.deleteMany()
      await tx.stage.deleteMany()
      await tx.buildObject.deleteMany()

      if (data.settings) {
        const s = reviveDates(data.settings as AnyRecord, []) as { lang?: string; masterName?: string; companyName?: string; passHash?: string; passSalt?: string }
        await tx.appSettings.upsert({
          where: { id: 1 },
          update: {
            lang: s.lang ?? 'ru',
            masterName: s.masterName ?? '',
            companyName: s.companyName ?? '',
            passHash: s.passHash ?? '',
            passSalt: s.passSalt ?? '',
          },
          create: { id: 1, lang: s.lang ?? 'ru', masterName: s.masterName ?? '', companyName: s.companyName ?? '' },
        })
      }
      const asArr = (x: unknown): AnyRecord[] => (Array.isArray(x) ? (x as AnyRecord[]) : [])

      for (const o of asArr(data.objects)) {
        await tx.buildObject.create({ data: reviveDates(o, ['deadline', 'createdAt']) as never })
      }
      for (const s of asArr(data.stages)) {
        await tx.stage.create({ data: reviveDates(s, ['doneAt']) as never })
      }
      for (const e of asArr(data.estimates)) {
        await tx.estimate.create({ data: reviveDates(e, ['sentAt', 'approvedAt', 'createdAt']) as never })
      }
      for (const l of asArr(data.estimateLines)) {
        await tx.estimateLine.create({ data: l as never })
      }
      for (const a of asArr(data.acts)) {
        await tx.act.create({ data: reviveDates(a, ['date', 'periodFrom', 'periodTo']) as never })
      }
      for (const l of asArr(data.actLines)) {
        await tx.actLine.create({ data: l as never })
      }
      for (const p of asArr(data.payments)) {
        await tx.payment.create({ data: reviveDates(p, ['at']) as never })
      }
      for (const p of asArr(data.photos)) {
        await tx.photo.create({ data: reviveDates(p, ['takenAt', 'createdAt']) as never })
      }
      for (const p of asArr(data.priceItems)) {
        await tx.priceItem.create({ data: reviveDates(p, ['updatedAt']) as never })
      }
      for (const t of asArr(data.templates)) {
        await tx.template.create({ data: t as never })
      }
      for (const c of asArr(data.comments)) {
        await tx.comment.create({ data: reviveDates(c, ['createdAt']) as never })
      }
    })
    return {
      ok: true,
      counts: {
        objects: asArrCount(data.objects),
        estimates: asArrCount(data.estimates),
        acts: asArrCount(data.acts),
        photos: asArrCount(data.photos),
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ошибка восстановления' }
  }
}

function asArrCount(x: unknown): number {
  return Array.isArray(x) ? x.length : 0
}
