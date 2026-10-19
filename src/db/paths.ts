// Единая логика путей: файл SQLite и хранилище фото.
//
// ВАЖНО: Prisma резолвит ОТНОСИТЕЛЬНЫЕ file:-пути не от корня проекта,
// а от каталога со схемой (prisma/). Поэтому дефолт в .env.example —
// `file:../db/custom.db` (получится <корень>/db/custom.db). Хранилище фото
// всегда лежит РЯДОМ с фактическим файлом базы (в <каталог базы>/uploads) —
// база и фото переезжают вместе. Своё расположение фото — PROAKT_UPLOADS_DIR.

import path from 'path'

/** Каталог схемы Prisma — база для относительных file:-путей. */
export function prismaBaseDir(): string {
  return path.resolve(process.cwd(), 'prisma')
}

/** Абсолютный путь к файлу SQLite из DATABASE_URL (по правилам Prisma). */
export function sqliteDbFile(): string {
  const url = (process.env.DATABASE_URL ?? 'file:./db/custom.db').trim()
  const p = url.replace(/^file:/, '')
  if (path.isAbsolute(p)) return p
  return path.resolve(prismaBaseDir(), p)
}

/** Каталог хранилища фото: рядом с базой; переопределяется PROAKT_UPLOADS_DIR. */
export function uploadsDirPath(): string {
  const custom = process.env.PROAKT_UPLOADS_DIR?.trim()
  if (custom) return path.resolve(custom)
  return path.join(path.dirname(sqliteDbFile()), 'uploads')
}
