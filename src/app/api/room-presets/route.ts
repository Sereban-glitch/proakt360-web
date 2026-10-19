// GET /api/room-presets — типовые помещения с нормами (S / PH / P).

import { NextResponse } from 'next/server'
import { roomPresets } from '@/db/rooms'

export const dynamic = 'force-dynamic'

import { requireMaster } from '@/db/http'

export async function GET(req: Request) {
  const denied = await requireMaster(req)
  if (denied) return denied

  return NextResponse.json({ items: roomPresets })
}
