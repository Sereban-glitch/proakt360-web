// GET  /api/objects — список объектов (активные сверху, далее по дате создания).
// POST /api/objects — новый объект (демо: без авторизации).

import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { objectBrief, listObjectBriefs, OBJECT_BRIEF_INCLUDE } from '@/db/queries'
import { asString, badRequest, readBody, requireMaster } from '@/db/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  try {
    const items = await listObjectBriefs()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить объекты' }, { status: 500 })
  }
}

const DEFAULT_STAGES: Array<{ title: string; status: string }> = [
  { title: 'Демонтаж', status: 'current' },
  { title: 'Черновые работы', status: 'next' },
  { title: 'Электрика и сантехника', status: 'todo' },
  { title: 'Малярные работы', status: 'todo' },
  { title: 'Финиш', status: 'todo' },
]

export async function POST(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  const body = await readBody(req)
  if (!body) return badRequest('Некорректное тело запроса')
  const name = asString(body.name)?.trim() ?? ''
  const customer = asString(body.customer)?.trim() ?? ''
  const address = asString(body.address)?.trim() ?? ''
  if (!name) return badRequest('Укажите название объекта')
  if (!customer) return badRequest('Укажите заказчика')
  if (name.length > 200 || customer.length > 200) return badRequest('Слишком длинные поля (макс. 200)')

  try {
    const object = await db.buildObject.create({
      data: {
        name,
        customer,
        address,
        clientToken: `demo-${randomBytes(6).toString('hex')}`,
        stages: {
          create: DEFAULT_STAGES.map((s, i) => ({ order: i + 1, title: s.title, status: s.status })),
        },
      },
      include: OBJECT_BRIEF_INCLUDE,
    })
    return NextResponse.json(objectBrief(object))
  } catch {
    return NextResponse.json({ error: 'Не удалось создать объект' }, { status: 500 })
  }
}
